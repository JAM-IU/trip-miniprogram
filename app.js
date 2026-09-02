// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: '提示',
        content: '当前基础库版本过低，无法使用云开发能力，请在开发者工具右上角"详情-本地设置"中选择高版本基础库',
        showCancel: false
      })
      return
    }
    // 默认使用第一个（默认）云环境，只建了一个环境的话不用改这里。
    // 如果你有多个环境，请把下面一行注释打开，把 env 改成你的环境ID（云开发控制台左上角可复制）
    // wx.cloud.init({ env: '你的环境ID', traceUser: true })
    wx.cloud.init({ traceUser: true })
  }
})
