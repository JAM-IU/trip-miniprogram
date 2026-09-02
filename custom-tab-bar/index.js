// 自定义底部导航（胶囊浮层 + 圆形图标按钮 + 滚动自动隐藏）
Component({
  data: {
    theme: 'light',
    selected: 0,
    hidden: false,
    list: [
      { pagePath: '/pages/plan/plan', text: '行程', icon: '🗺️' },
      { pagePath: '/pages/expense/expense', text: '记账', icon: '💰' },
      { pagePath: '/pages/settle/settle', text: '结算', icon: '🧾' }
    ]
  },

  methods: {
    switchTab(e) {
      const path = e.currentTarget.dataset.path
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
    },

    // 页面滚动方向驱动：下滑隐藏，上滑显示
    setHidden(hidden) {
      if (this.data.hidden === hidden) return
      this.setData({ hidden: hidden })
    }
  }
})
