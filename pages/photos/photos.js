// 照片墙占位页：服务器筹备中，先上线 UI 占位
Page({
  data: {
    theme: 'light',
    // 占位相框：示意未来墙上的照片类型
    frames: [
      { icon: '🌅', label: '日照金山' },
      { icon: '🌊', label: '洱海日落' },
      { icon: '🏮', label: '古城夜景' },
      { icon: '🛣️', label: '公路大片' },
      { icon: '🍜', label: '美食打卡' },
      { icon: '📸', label: '全员合影' }
    ],
    features: [
      { icon: '👥', title: '同组共享', desc: '伙伴们拍的照片自动汇总到同一面墙' },
      { icon: '🗓️', title: '按天分组', desc: '跟着行程时间线排布，回忆有顺序' },
      { icon: '⬇️', title: '原图保存', desc: '喜欢的照片一键下载到相册' }
    ]
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme })
    getApp().syncTabBar()
  },

  // 系统主题变化时由 app.js 调用
  applyTheme(theme) {
    this.setData({ theme: theme })
  }
})
