// AI 攻略解析：把粘贴的攻略文字 / 攻略截图整理成结构化行程
// 纯文本走 wx.cloud.extend.AI 体验模型 hunyuan-v3/hy3（免费，基础库 3.15.1+）
// 带截图走多模态模型 glm-5v-turbo（售卖模型，需在云开发控制台 AI+ → 模型管理开通）
const MAX_ITEMS = 40
const MAX_IMAGES = 4
// imgSecCheck 限制单张 1MB，留点余量压到 900KB 内
const IMG_LIMIT = 900 * 1024

const TEXT_PROVIDER = 'hunyuan-v3'
const TEXT_MODEL = 'hy3'
const VISION_PROVIDER = 'cloudbase'
const VISION_MODEL = 'glm-5v-turbo'

// 当前环境是否支持 AI 能力（低版本微信没有 extend.AI）
function aiSupported() {
  return !!(wx.cloud && wx.cloud.extend && wx.cloud.extend.AI && wx.cloud.extend.AI.createModel)
}

// ===== Prompt =====
function jsonRules(totalDays) {
  return [
    '要求：',
    '1. 只输出一个 JSON 对象，不要输出任何解释文字，不要用 markdown 代码块包裹',
    '2. JSON 格式：{"items":[{"day":1,"time":"09:00","title":"名称","desc":"一句话说明","fee":"费用说明","level":"rec"}]}',
    '3. day 是第几天（整数，1 到 ' + totalDays + '），按攻略中的天数/日期顺序填写；无法判断的按内容先后顺序合理分配到各天',
    '4. time 用 HH:MM 24 小时制；攻略写的是上午/下午/晚上/全天等就照抄原文；没有时间就留空字符串',
    '5. title 是景点或活动名称，不超过 15 字；desc 是一句话说明，不超过 40 字；fee 是费用说明（如 免费 / 约45元），没有就留空字符串',
    '6. level 只能是 must（交通/住宿/核心景点等关键安排）、rec（推荐）、opt（可选/待定）之一，拿不准用 rec',
    '7. 忽略广告、评论区、心情随笔、穿搭拍照心得等与行程安排无关的内容',
    '8. 最多提取 ' + MAX_ITEMS + ' 条，宁缺毋滥'
  ].join('\n')
}

function buildTextPrompt(group, text) {
  const totalDays = (group && group.totalDays) || 7
  const cities = ((group && group.cities) || []).join('、') || '未知'
  return [
    '你是旅行行程整理助手。把下面这段旅行攻略/笔记整理成结构化行程，只输出 JSON。',
    '',
    jsonRules(totalDays),
    '',
    '旅行背景：目的地 ' + cities + '，共 ' + totalDays + ' 天行程。',
    '',
    '攻略原文：',
    text
  ].join('\n')
}

function buildVisionPrompt(group, text, imgCount) {
  const totalDays = (group && group.totalDays) || 7
  const cities = ((group && group.cities) || []).join('、') || '未知'
  const lines = [
    '你是旅行行程整理助手。下面给你 ' + imgCount + ' 张旅行攻略截图' + (text ? '和一段补充文字' : '') + '，把其中的行程安排整理成结构化行程，只输出 JSON。',
    '',
    jsonRules(totalDays),
    '',
    '旅行背景：目的地 ' + cities + '，共 ' + totalDays + ' 天行程。'
  ]
  if (text) {
    lines.push('', '补充文字：', text)
  }
  return lines.join('\n')
}

// ===== 结果提取 =====
// 模型返回的 content 可能是字符串，也可能是分片数组
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

// 不同 SDK 形态的返回读取：res.text（新形态）/ OpenAI message 形态 / SSE 增量形态 / 原始字符串
function readResponse(res) {
  if (!res) return ''
  if (typeof res === 'string') return readStringPayload(res)
  if (typeof res.text === 'string' && res.text) return res.text
  const choice = res.choices && res.choices[0]
  if (choice) {
    if (choice.message) return contentToText(choice.message.content)
    if (choice.delta) return contentToText(deltaText(choice.delta))
  }
  return ''
}

// delta 里可能是 content 字符串，也可能分 reasoning_content / content 两段
function deltaText(delta) {
  if (!delta) return ''
  if (typeof delta.content === 'string' && delta.content) return delta.content
  return ''
}

// 返回是字符串时的兜底：可能是 JSON 文本，也可能是 SSE 原始流（data: {...} 逐行）
function readStringPayload(s) {
  const t = String(s).trim()
  if (!t) return ''
  if (t.indexOf('data:') !== 0) return s
  let out = ''
  t.split('\n').forEach(function (line) {
    line = line.trim()
    if (line.indexOf('data:') !== 0) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const j = JSON.parse(payload)
      const c = j.choices && j.choices[0]
      const piece = c && ((c.message && c.message.content) || (c.delta && deltaText(c.delta)))
      if (piece) out += contentToText(piece)
    } catch (e) { /* 跳过坏行 */ }
  })
  return out
}

// 调试日志：定位「没解析出行程」用，在控制台打印模型原始返回
function debugLog(tag, res, rawText) {
  let preview = ''
  try { preview = JSON.stringify(res) } catch (e) { preview = String(res) }
  console.log('[ai:' + tag + '] 返回类型=' + typeof res + ' 原始片段=' + String(preview).slice(0, 600))
  console.log('[ai:' + tag + '] 提取文本(' + rawText.length + '字)=' + rawText.slice(0, 600))
}

// 从（可能被截断的）文本里逐条抢救完整的 item JSON 对象（item 字段扁平无嵌套）
function salvageItems(text) {
  const out = []
  const re = /\{[^{}\[\]]*"title"\s*:\s*"[\s\S]*?"[^{}\[\]]*\}/g
  let m
  while ((m = re.exec(text)) !== null && out.length < MAX_ITEMS) {
    try {
      const o = JSON.parse(m[0])
      if (o && typeof o === 'object' && o.title) out.push(o)
    } catch (e) { /* 跳过坏块 */ }
  }
  return out
}

// 从模型输出中稳健地提取并校验行程条目
function extractItems(raw, totalDays) {
  let text = contentToText(raw)
  if (!text) return []
  // 去掉 markdown 代码块包裹
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1]
  // 截取第一个 { 到最后一个 }，容忍前后废话
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  if (s < 0 || e <= s) return []
  let list = null
  try {
    const obj = JSON.parse(text.slice(s, e + 1))
    if (obj && Array.isArray(obj.items)) list = obj.items
  } catch (err) {
    list = null
  }
  // 整体 JSON 解析失败（常见于长输出被 max_tokens 截断）：逐条抢救完整的 item 对象
  if (!list) list = salvageItems(text)
  if (!list.length) return []
  const out = []
  list.forEach(function (it) {
    if (!it || typeof it !== 'object') return
    const title = String(it.title || '').trim().slice(0, 20)
    if (!title) return
    let day = parseInt(it.day, 10)
    if (!isFinite(day) || day < 1) day = 1
    if (day > totalDays) day = totalDays
    let level = String(it.level || 'rec')
    if (['must', 'rec', 'opt'].indexOf(level) < 0) level = 'rec'
    out.push({
      day: day,
      time: String(it.time || '').trim().slice(0, 10),
      title: title,
      desc: String(it.desc || '').trim().slice(0, 60),
      fee: String(it.fee || '').trim().slice(0, 10),
      level: level
    })
  })
  return out.slice(0, MAX_ITEMS)
}

// ===== 解析入口 =====
/**
 * 纯文本解析（免费体验模型 hy3）
 */
async function parseTrips(group, text) {
  const totalDays = (group && group.totalDays) || 7
  const model = wx.cloud.extend.AI.createModel(TEXT_PROVIDER)
  const res = await model.generateText({
    model: TEXT_MODEL,
    messages: [{ role: 'user', content: buildTextPrompt(group, text) }]
  })
  if (res && res.code) throw new Error(res.message || String(res.code))
  const raw = readResponse(res)
  debugLog('text', res, raw)
  return extractItems(raw, totalDays)
}

/**
 * 截图（可混合补充文字）解析（多模态模型 glm-5v-turbo）
 * @param {string[]} dataUrls 图片 data URL 列表（data:image/jpeg;base64,...）
 */
async function parseTripsVision(group, text, dataUrls) {
  const totalDays = (group && group.totalDays) || 7
  const model = wx.cloud.extend.AI.createModel(VISION_PROVIDER)
  const content = [{ type: 'text', text: buildVisionPrompt(group, text, dataUrls.length) }]
  dataUrls.forEach(function (u) {
    content.push({ type: 'image_url', image_url: { url: u } })
  })
  // 注意：generateText 的参数就是请求体本身（不同于 streamText 的 { data } 包装）
  const res = await model.generateText({
    model: VISION_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: content }]
  })
  // 网关错误时 SDK 不抛异常而是返回错误体（如 {code, message}），主动抛出让上层提示
  if (res && res.code) throw new Error(res.message || String(res.code))
  const raw = readResponse(res)
  debugLog('vision', res, raw)
  return extractItems(raw, totalDays)
}

// ===== 图片工具 =====
function fileSize(path) {
  try {
    const st = wx.getFileSystemManager().statSync(path)
    return (st && st.size) || 0
  } catch (e) {
    return 0
  }
}

// 超过 limit 就逐级降质量压缩（输出 jpg）
async function compressIfNeeded(path, limit) {
  let src = path
  let size = fileSize(src)
  let quality = 80
  while (size > limit && quality >= 20) {
    const res = await new Promise(function (resolve, reject) {
      wx.compressImage({ src: src, quality: quality, success: resolve, fail: reject })
    })
    src = res.tempFilePath
    size = fileSize(src)
    quality -= 20
  }
  return { path: src, size: size }
}

function toDataUrl(path) {
  return new Promise(function (resolve, reject) {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: function (res) {
        resolve('data:image/jpeg;base64,' + res.data)
      },
      fail: reject
    })
  })
}

/**
 * 选攻略截图（相册）→ 压到 900KB 内 → 转 dataUrl
 * 注意：dataUrl 很大（约 1MB+/张），调用方不要放进 setData
 * @returns {Promise<Array<{path, dataUrl, size}>>} 用户取消时 reject，需自行识别 cancel
 */
async function pickGuideImages(maxCount) {
  const res = await new Promise(function (resolve, reject) {
    wx.chooseMedia({
      count: Math.min(maxCount || MAX_IMAGES, MAX_IMAGES),
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: resolve,
      fail: reject
    })
  })
  const files = res.tempFiles || []
  const out = []
  for (let i = 0; i < files.length; i++) {
    const c = await compressIfNeeded(files[i].tempFilePath, IMG_LIMIT)
    const dataUrl = await toDataUrl(c.path)
    out.push({ path: c.path, dataUrl: dataUrl, size: c.size })
  }
  return out
}

// 上传临时图到云存储供 imgSecCheck 使用（云函数检查完会删除）
async function uploadForCheck(path) {
  const res = await wx.cloud.uploadFile({
    cloudPath: 'sec-tmp/' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '.jpg',
    filePath: path
  })
  return res.fileID
}

module.exports = {
  aiSupported: aiSupported,
  parseTrips: parseTrips,
  parseTripsVision: parseTripsVision,
  pickGuideImages: pickGuideImages,
  uploadForCheck: uploadForCheck,
  MAX_IMAGES: MAX_IMAGES,
  VISION_MODEL: VISION_MODEL
}
