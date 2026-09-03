// 文本内容安全校验（微信 security.msgSecCheck）
// 用于 AI 导入前对玩家粘贴的攻略文字做合规检查
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const content = String((event && event.content) || '').trim().slice(0, 3000)
  if (!content) return { pass: false, reason: 'empty' }

  const wxContext = cloud.getWXContext()

  // 优先 v2 签名（openid + scene），返回 result.suggest
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      openid: wxContext.OPENID,
      scene: 2, // 评论类文本
      version: 2,
      content: content
    })
    const suggest = res && res.result && res.result.suggest
    return { pass: suggest === 'pass', reason: suggest || 'unknown' }
  } catch (e) {
    // 部分环境不支持 v2 签名，降级到 v1（违规会抛 87014）
    try {
      await cloud.openapi.security.msgSecCheck({ content: content })
      return { pass: true, reason: 'v1-pass' }
    } catch (e2) {
      if (e2 && e2.errCode === 87014) return { pass: false, reason: 'risky' }
      // 安全接口本身故障：放行但标记，避免阻塞主功能
      console.warn('msgSecCheck unavailable', e2)
      return { pass: true, unchecked: true, reason: 'check-unavailable' }
    }
  }
}
