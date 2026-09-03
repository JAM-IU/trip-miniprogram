// AI 攻略解析：把粘贴的旅行攻略文字整理成结构化行程
// 走小程序端 wx.cloud.extend.AI（基础库 3.15.1+），体验模型 hunyuan-v3/hy3 免费
const MAX_ITEMS = 40

// 当前环境是否支持 AI 能力（低版本微信没有 extend.AI）
function aiSupported() {
  return !!(wx.cloud && wx.cloud.extend && wx.cloud.extend.AI && wx.cloud.extend.AI.createModel)
}

function buildPrompt(group, text) {
  const totalDays = (group && group.totalDays) || 7
  const cities = ((group && group.cities) || []).join('、') || '未知'
  return [
    '你是旅行行程整理助手。把下面这段旅行攻略/笔记整理成结构化行程，只输出 JSON。',
    '',
    '要求：',
    '1. 只输出一个 JSON 对象，不要输出任何解释文字，不要用 markdown 代码块包裹',
    '2. JSON 格式：{"items":[{"day":1,"time":"09:00","title":"名称","desc":"一句话说明","fee":"费用说明","level":"rec"}]}',
    '3. day 是第几天（整数，1 到 ' + totalDays + '），按攻略中的天数/日期顺序填写；无法判断的按内容先后顺序合理分配到各天',
    '4. time 用 HH:MM 24 小时制；攻略写的是上午/下午/晚上/全天等就照抄原文；没有时间就留空字符串',
    '5. title 是景点或活动名称，不超过 15 字；desc 是一句话说明，不超过 40 字；fee 是费用说明（如 免费 / 约45元），没有就留空字符串',
    '6. level 只能是 must（交通/住宿/核心景点等关键安排）、rec（推荐）、opt（可选/待定）之一，拿不准用 rec',
    '7. 忽略广告、心情随笔、穿搭拍照心得等与行程安排无关的内容',
    '8. 最多提取 ' + MAX_ITEMS + ' 条，宁缺毋滥',
    '',
    '旅行背景：目的地 ' + cities + '，共 ' + totalDays + ' 天行程。',
    '',
    '攻略原文：',
    text
  ].join('\n')
}

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
  let obj = null
  try {
    obj = JSON.parse(text.slice(s, e + 1))
  } catch (err) {
    return []
  }
  const list = obj && obj.items
  if (!Array.isArray(list)) return []
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

/**
 * 调 AI 模型解析攻略文字
 * @param {object} group 当前行程组（用于提供目的地/天数上下文）
 * @param {string} text 攻略原文
 * @returns {Promise<Array>} 校验过的行程条目（可能为空数组，由调用方提示重试）
 */
async function parseTrips(group, text) {
  const model = wx.cloud.extend.AI.createModel('hunyuan-v3')
  const res = await model.generateText({
    model: 'hy3',
    messages: [{ role: 'user', content: buildPrompt(group, text) }]
  })
  const content = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content
  return extractItems(content, (group && group.totalDays) || 7)
}

module.exports = {
  aiSupported: aiSupported,
  parseTrips: parseTrips
}
