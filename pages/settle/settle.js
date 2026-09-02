// 结算页：自动算人均 + 最简转账方案
const dbUtil = require('../../utils/db')
const scrollHide = require('../../utils/scrollhide')

function r2(x) {
  return Math.round(x * 100) / 100
}

// 金额数字滚动动画（0 → 目标值）
function rollNumber(that, key, target) {
  target = Number(target) || 0
  const duration = 600
  const start = Date.now()
  const timer = setInterval(function () {
    const p = Math.min(1, (Date.now() - start) / duration)
    const eased = 1 - Math.pow(1 - p, 3)
    const d = {}
    d[key] = Math.round(target * eased * 100) / 100
    that.setData(d)
    if (p >= 1) clearInterval(timer)
  }, 16)
}

Page({
  data: {
    theme: 'light',
    themeMode: 'auto',
    loading: true,
    stats: [],
    transfers: [],
    totalAmount: 0,
    count: 0,
    hasMembers: true
  },

  onShow() {
    const saved = wx.getStorageSync('theme')
    this.setData({
      theme: getApp().globalData.theme,
      themeMode: (saved === 'light' || saved === 'dark') ? saved : 'auto'
    })
    this.syncTabBar(2)
    scrollHide.reset(this)
    this.loadData()
  },

  onPageScroll(e) {
    scrollHide.handle(this, e)
  },

  // 系统主题变化时由 app.js 调用
  applyTheme(theme) {
    this.setData({ theme: theme })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ theme: theme })
    }
  },

  // 外观：跟随系统 / 白天 / 夜间
  onThemeMode(e) {
    const mode = e.currentTarget.dataset.mode
    const app = getApp()
    const applied = app.setThemeMode(mode)
    this.setData({ themeMode: mode, theme: applied })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ theme: applied })
    }
    // 其他页面下次 onShow 时会读取 globalData.theme，无需逐个通知
  },

  syncTabBar(selected) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: selected, theme: getApp().globalData.theme })
    }
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const mems = await dbUtil.fetchAll('members', 'createdAt', 'asc')
      const exps = await dbUtil.fetchAll('expenses', 'createdAt', 'asc')

      if (!mems.length) {
        this.setData({ hasMembers: false, loading: false, stats: [], transfers: [], totalAmount: 0, count: exps.length })
        return
      }

      // 每人：垫付 paid / 分摊 owe
      const map = {}
      mems.forEach(function (m) {
        map[m.name] = { name: m.name, avatar: m.avatar || '', paid: 0, owe: 0 }
      })
      let total = 0
      exps.forEach(function (e) {
        if (!e.amount || !e.members || !e.members.length) return
        total += e.amount
        if (map[e.payer]) map[e.payer].paid += e.amount
        const share = r2(e.amount / e.members.length)
        e.members.forEach(function (n) {
          if (map[n]) map[n].owe += share
        })
      })

      const stats = []
      Object.keys(map).forEach(function (k) {
        const s = map[k]
        const net = r2(s.paid - s.owe)
        stats.push({
          name: s.name,
          avatar: s.avatar,
          paid: r2(s.paid),
          owe: r2(s.owe),
          net: net,
          isPos: net > 0.005,
          isZero: Math.abs(net) <= 0.005,
          netLabel: net > 0.005 ? '应收 ¥' + net.toFixed(2) : (net < -0.005 ? '应付 ¥' + Math.abs(net).toFixed(2) : '已结清')
        })
      })

      // 最简转账：贪心配对
      const debtors = stats.filter(function (s) { return s.net < -0.005 })
        .sort(function (a, b) { return a.net - b.net })
      const creditors = stats.filter(function (s) { return s.net > 0.005 })
        .sort(function (a, b) { return b.net - a.net })

      const transfers = []
      let i = 0
      let j = 0
      while (i < debtors.length && j < creditors.length) {
        const dLeft = -debtors[i].net
        const cLeft = creditors[j].net
        const amt = r2(Math.min(dLeft, cLeft))
        if (amt > 0.005) {
          transfers.push({
            from: debtors[i].name,
            to: creditors[j].name,
            amount: amt.toFixed(2)
          })
        }
        debtors[i].net = r2(debtors[i].net + amt)
        creditors[j].net = r2(creditors[j].net - amt)
        if (debtors[i].net > -0.005) i++
        if (creditors[j].net < 0.005) j++
      }

      this.setData({
        hasMembers: true,
        stats: stats,
        transfers: transfers,
        totalAmount: 0,
        count: exps.length,
        loading: false
      })
      rollNumber(this, 'totalAmount', r2(total))
      this._total = r2(total)
    } catch (e) {
      this.setData({ loading: false })
      wx.showModal({
        title: '加载失败',
        content: '请确认已创建 members 和 expenses 集合（见教程第5步）。' + ((e && (e.errMsg || e.message)) || ''),
        showCancel: false
      })
    }
  },

  onPullDownRefresh() {
    const that = this
    this.loadData().then(function () {
      wx.stopPullDownRefresh()
    })
  },

  // 一键复制 AA 结算文案（发群用）
  onCopySettle() {
    const stats = this.data.stats
    const transfers = this.data.transfers
    const total = this._total || 0
    if (!stats.length) {
      wx.showToast({ title: '还没有结算数据', icon: 'none' })
      return
    }
    const avg = stats.length ? Math.round(total / stats.length * 100) / 100 : 0
    const lines = []
    lines.push('🏔️ 滇西北自驾 AA 结算')
    lines.push('——————')
    lines.push('💰 总花费 ¥' + total.toFixed(2) + '（共 ' + this.data.count + ' 笔）')
    lines.push('👥 人均 ¥' + avg.toFixed(2) + '（' + stats.length + ' 人）')
    lines.push('——————')
    stats.forEach(function (s) {
      let tail = '已结清'
      if (s.isPos) tail = '应收 ¥' + Math.abs(s.net).toFixed(2)
      else if (!s.isZero) tail = '应付 ¥' + Math.abs(s.net).toFixed(2)
      lines.push(s.name + '：垫付 ¥' + s.paid.toFixed(2) + '，消费 ¥' + s.owe.toFixed(2) + ' → ' + tail)
    })
    if (transfers.length) {
      lines.push('——————')
      lines.push('💸 转账方案：')
      transfers.forEach(function (t) {
        lines.push(t.from + ' → ' + t.to + '  ¥' + t.amount)
      })
    } else {
      lines.push('——————')
      lines.push('✅ 账目已平，无需转账')
    }
    wx.setClipboardData({
      data: lines.join('\n'),
      success: function () {
        wx.showToast({ title: '已复制，去群里粘贴吧', icon: 'none' })
      }
    })
  }
})
