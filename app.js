// app.js
App({
  globalData: {
    theme: 'light' // light 白天 / dark 夜间
  },

  onLaunch() {
    // 主题规则：本地有手动设置过（storage 有 theme）→ 用手动的；否则跟随系统
    let theme = 'light'
    try {
      const sys = wx.getSystemInfoSync()
      if (sys.theme === 'dark') theme = 'dark'
    } catch (e) {}
    const saved = wx.getStorageSync('theme')
    if (saved === 'dark' || saved === 'light') theme = saved
    this.globalData.theme = theme
    this.applyChrome(this.globalData.theme)

    // 监听系统主题变化（仅在未手动锁定时跟随）
    if (wx.onThemeChange) {
      wx.onThemeChange((res) => {
        const saved = wx.getStorageSync('theme')
        if (saved) return // 用户手动选过，不跟随系统
        if (res.theme !== 'light' && res.theme !== 'dark') return
        this.globalData.theme = res.theme
        this.applyChrome(res.theme)
        const pages = getCurrentPages()
        pages.forEach(function (p) {
          if (typeof p.applyTheme === 'function') p.applyTheme(res.theme)
        })
      })
    }

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

    // 静默登录：通过云函数拿 openid，用于自动识别"我"是哪个成员（无需用户操作）
    const that = this
    this.globalData.openid = ''
    this.globalData.openidReady = wx.cloud.callFunction({ name: 'login' })
      .then(function (res) {
        const oid = res && res.result && res.result.openid
        if (oid) that.globalData.openid = oid
        return oid || ''
      })
      .catch(function () {
        // login 云函数未部署时不影响使用，只是无法自动认出"我"
        return ''
      })
  },

  // 设置主题模式：'auto' 跟随系统 / 'light' / 'dark'
  setThemeMode(mode) {
    if (mode === 'auto') {
      wx.removeStorageSync('theme')
      let sys = 'light'
      try {
        const info = wx.getSystemInfoSync()
        if (info.theme === 'dark') sys = 'dark'
      } catch (e) {}
      this.globalData.theme = sys
      this.applyChrome(sys)
      return sys
    }
    wx.setStorageSync('theme', mode)
    this.globalData.theme = mode
    this.applyChrome(mode)
    return mode
  },

  // 同步导航栏 / 背景 / tab 栏配色
  applyChrome(theme) {
    const isDark = theme === 'dark'
    // 外观颜色
    wx.setBackgroundColor({
      backgroundColorTop: isDark ? '#0A0E18' : '#EEF0F5',
      backgroundColor: isDark ? '#0A0E18' : '#EEF0F5',
      backgroundColorBottom: isDark ? '#0A0E18' : '#EEF0F5'
    })
    // 导航栏
    wx.setNavigationBarColor({
      frontColor: isDark ? '#ffffff' : '#000000',
      backgroundColor: isDark ? '#0F1420' : '#F7F8FC',
      animation: { duration: 200, timingFunc: 'easeIn' }
    })
    // tab 栏
    if (wx.setTabBarStyle) {
      wx.setTabBarStyle({
        color: isDark ? '#8A93A6' : '#9BA3AF',
        selectedColor: isDark ? '#F5C46A' : '#4F8CFF',
        backgroundColor: isDark ? '#121826' : '#ffffff',
        borderStyle: isDark ? 'black' : 'white'
      })
    }
  }
})