// AI 攻略截图识图：调用自己配置的 OpenAI 兼容视觉模型
// Key 放在云函数环境变量里，不出现在小程序代码中；云函数出网不受小程序域名白名单限制
//
// 环境变量（云开发控制台 → 云函数 → aiParse → 配置 → 环境变量）：
//   AI_API_KEY   模型 API Key（必填，智谱 bigmodel.cn 免费注册领取）
//   AI_BASE_URL  OpenAI 兼容接口地址（不含 /chat/completions），默认 https://open.bigmodel.cn/api/paas/v4
//   AI_MODEL     模型名，默认 glm-4v-flash（智谱免费视觉模型）
//   AI_MAX_TOKENS 输出上限，默认 1024（glm-4v-flash 上限就是 1024；换别家模型可调大）
//
// 注意：请把本函数「执行超时时间」改为 60 秒（默认 3 秒不够识图用）
const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// Node16 运行时无全局 fetch，用原生 https 发 POST JSON
function postJson(urlStr, headers, bodyObj, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const u = new URL(urlStr)
    const data = JSON.stringify(bodyObj)
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      timeout: timeoutMs || 55000,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }, headers)
    }, function (res) {
      const chunks = []
      res.on('data', function (c) { chunks.push(c) })
      res.on('end', function () {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch (e) { /* 非 JSON 响应 */ }
        resolve({ status: res.statusCode, text: text, json: json })
      })
    })
    req.on('timeout', function () { req.destroy(new Error('request-timeout')) })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function contentToText(content) {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(function (p) {
      if (typeof p === 'string') return p
      return (p && (p.text || p.content)) || ''
    }).join('')
  }
  return String(content)
}

exports.main = async (event) => {
  const prompt = String((event && event.prompt) || '')
  const fileIDs = (event && Array.isArray(event.fileIDs)) ? event.fileIDs.slice(0, 4) : []
  if (!prompt) return { error: 'empty', detail: '缺少 prompt' }

  const baseURL = (process.env.AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '')
  const apiKey = process.env.AI_API_KEY || ''
  const model = process.env.AI_MODEL || 'glm-4v-flash'
  if (!apiKey) {
    return {
      error: 'no-key',
      detail: '云函数 aiParse 未配置模型 Key：云开发控制台 → 云函数 → aiParse → 配置 → 环境变量，添加 AI_API_KEY（见部署教程第 5.5 步）'
    }
  }

  // 截图：云存储 fileID → base64 data URL（安检时上传的临时图，本函数用完删除）
  const content = [{ type: 'text', text: prompt }]
  for (let i = 0; i < fileIDs.length; i++) {
    try {
      const f = await cloud.downloadFile({ fileID: fileIDs[i] })
      content.push({
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,' + f.fileContent.toString('base64') }
      })
    } catch (e) {
      console.warn('download failed', fileIDs[i], e)
    }
  }

  let resp = null
  try {
    resp = await postJson(baseURL + '/chat/completions', { Authorization: 'Bearer ' + apiKey }, {
      model: model,
      max_tokens: parseInt(process.env.AI_MAX_TOKENS, 10) || 1024,
      messages: [{ role: 'user', content: content }]
    })
  } catch (e) {
    return { error: 'network', detail: '模型接口请求失败：' + (e && e.message ? e.message : String(e)) }
  } finally {
    // 临时安检图片用完即删，不占用存储
    if (fileIDs.length) cloud.deleteFile({ fileList: fileIDs }).catch(function () {})
  }

  if (resp.status !== 200 || !resp.json) {
    return { error: 'api-' + resp.status, detail: (resp.text || '').slice(0, 300) }
  }
  if (resp.json.error) {
    return { error: 'api-error', detail: String(resp.json.error.message || JSON.stringify(resp.json.error)).slice(0, 300) }
  }
  const choice = resp.json.choices && resp.json.choices[0]
  const text = contentToText(choice && choice.message && choice.message.content)
  return { text: text }
}
