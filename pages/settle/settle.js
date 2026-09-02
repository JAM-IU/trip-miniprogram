// 结算页：自动算人均 + 最简转账方案
const dbUtil = require('../../utils/db')

function r2(x) {
  return Math.round(x * 100) / 100
}

Page({
  data: {
    loading: true,
    stats: [],
    transfers: [],
    totalAmount: 0,
    count: 0,
    hasMembers: true
  },

  onShow() {
    this.loadData()
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
        map[m.name] = { name: m.name, paid: 0, owe: 0 }
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
        totalAmount: r2(total),
        count: exps.length,
        loading: false
      })
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
  }
})
