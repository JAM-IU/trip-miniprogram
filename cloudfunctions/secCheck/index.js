// 内容安全校验（微信 security.msgSecCheck / imgSecCheck）
// 用于 AI 导入前对玩家粘贴的攻略文字、上传的攻略截图做合规检查
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ===== 文本校验 =====
async function checkText(content, openid) {
  if (!content) return { pass: false, reason: 'empty' }
  // 优先 v2 签名（openid + scene），返回 result.suggest
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      openid: openid,
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
      console.warn('msgSecCheck unavailable', e2)
      return { pass: true, unchecked: true, reason: 'check-unavailable' }
    }
  }
}

// ===== 图片校验（图片 ≤1MB，由小程序端压缩后上传云存储中转） =====
async function checkImage(fileID, openid) {
  if (!fileID) return { pass: false, reason: 'empty' }
  let buffer = null
  try {
    const res = await cloud.downloadFile({ fileID: fileID })
    buffer = res.fileContent
  } catch (e) {
    return { pass: false, reason: 'download-failed' }
  }
  const media = { contentType: 'image/jpeg', value: buffer }
  // 优先 v2 签名
  try {
    const res = await cloud.openapi.security.imgSecCheck({
      openid: openid,
      scene: 2,
      version: 2,
      media: media
    })
    const suggest = res && res.result && res.result.suggest
    return { pass: suggest === 'pass', reason: suggest || 'unknown' }
  } catch (e) {
    // 降级 v1（违规抛 87014）
    try {
      await cloud.openapi.security.imgSecCheck({ media: media })
      return { pass: true, reason: 'v1-pass' }
    } catch (e2) {
      if (e2 && e2.errCode === 87014) return { pass: false, reason: 'risky' }
      console.warn('imgSecCheck unavailable', e2)
      return { pass: true, unchecked: true, reason: 'check-unavailable' }
    }
  } finally {
    // 临时安检图片用完即删，不占用存储
    cloud.deleteFile({ fileList: [fileID] }).catch(function () {})
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 图片校验：{ type: 'img', fileID: 'cloud://...' }
  if (event && event.type === 'img') {
    return checkImage(event.fileID || '', openid)
  }

  // 文本校验：{ content: '...' }
  const content = String((event && event.content) || '').trim().slice(0, 3000)
  return checkText(content, openid)
}
