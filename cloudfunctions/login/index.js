// 登录云函数：返回调用者的 openid，用于自动识别成员
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async function () {
  const wxContext = cloud.getWXContext()
  return {
    openid: wxContext.OPENID || '',
    appid: wxContext.APPID || ''
  }
}
