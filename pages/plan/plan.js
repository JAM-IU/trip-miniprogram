// 行程页
const dbUtil = require('../../utils/db')
const seed = require('../../utils/seed')
const db = dbUtil.db

Page({
  data: {
    loading: true,
    days: [],
    // 编辑弹窗
    showEdit: false,
    isNew: true,
    editId: '',
    form: { day: 1, time: '', title: '', desc: '', fee: '', level: 'rec' },
    dayLabels: seed.DAY_LABELS,
    levels: [
      { key: 'must', label: '必去' },
      { key: 'rec', label: '推荐' },
      { key: 'opt', label: '可选' }
    ]
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      await seed.initIfEmpty()
      const list = await dbUtil.fetchAll('trips', 'order', 'asc')
      const dayMap = {}
      list.forEach(function (t) {
        if (!dayMap[t.day]) dayMap[t.day] = []
        dayMap[t.day].push(t)
      })
      const days = Object.keys(dayMap)
        .map(Number)
        .sort(function (a, b) { return a - b })
        .map(function (d) {
          return {
            day: d,
            theme: seed.DAY_THEMES[d] || 'dali',
            label: seed.DAY_LABELS[d - 1] || ('D' + d),
            date: (dayMap[d][0] && dayMap[d][0].date) || seed.DATE_LABELS[d - 1] || '',
            items: dayMap[d]
          }
        })
      this.setData({ days: days, loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showModal({
        title: '加载失败',
        content: '请确认已开通云开发，并创建了 trips 集合（见教程第5步）。' + ((e && (e.errMsg || e.message)) || ''),
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

  findTrip(id) {
    const days = this.data.days
    for (let i = 0; i < days.length; i++) {
      const items = days[i].items
      for (let j = 0; j < items.length; j++) {
        if (items[j]._id === id) return items[j]
      }
    }
    return null
  },

  // ===== 编辑弹窗 =====
  onEditItem(e) {
    const id = e.currentTarget.dataset.id
    const trip = this.findTrip(id)
    if (!trip) return
    this.setData({
      showEdit: true,
      isNew: false,
      editId: id,
      form: {
        day: trip.day,
        time: trip.time || '',
        title: trip.title || '',
        desc: trip.desc || '',
        fee: trip.fee || '',
        level: trip.level || 'rec'
      }
    })
  },

  onAddItem(e) {
    const day = Number(e.currentTarget.dataset.day) || 1
    this.setData({
      showEdit: true,
      isNew: true,
      editId: '',
      form: { day: day, time: '', title: '', desc: '', fee: '', level: 'rec' }
    })
  },

  closeEdit() {
    this.setData({ showEdit: false })
  },

  noop() {},

  onFormTitle(e) { this.setData({ 'form.title': e.detail.value }) },
  onFormTime(e) { this.setData({ 'form.time': e.detail.value }) },
  onFormDesc(e) { this.setData({ 'form.desc': e.detail.value }) },
  onFormFee(e) { this.setData({ 'form.fee': e.detail.value }) },
  onFormDay(e) { this.setData({ 'form.day': Number(e.detail.value) + 1 }) },
  onFormLevel(e) {
    this.setData({ 'form.level': e.currentTarget.dataset.level })
  },

  async onSave() {
    const f = this.data.form
    const title = (f.title || '').trim()
    if (!title) {
      wx.showToast({ title: '写个名称吧', icon: 'none' })
      return
    }
    const payload = {
      day: f.day,
      date: seed.DATE_LABELS[f.day - 1] || '',
      time: f.time,
      title: title,
      desc: f.desc,
      fee: f.fee,
      level: f.level
    }
    wx.showLoading({ title: '保存中' })
    try {
      if (this.data.isNew) {
        payload.order = Date.now()
        await db.collection('trips').add({ data: payload })
      } else {
        await db.collection('trips').doc(this.data.editId).update({ data: payload })
      }
      wx.hideLoading()
      this.setData({ showEdit: false })
      this.loadData()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  onDelete() {
    const that = this
    wx.showModal({
      title: '删除这条安排？',
      content: '删除后所有人都会看不到',
      confirmColor: '#D63031',
      success: async function (r) {
        if (!r.confirm) return
        wx.showLoading({ title: '删除中' })
        try {
          await db.collection('trips').doc(that.data.editId).remove()
          wx.hideLoading()
          that.setData({ showEdit: false })
          that.loadData()
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        }
      }
    })
  }
})
