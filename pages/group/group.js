// 行程组门页：创建 / 加入 / 切换行程组，数据按组隔离
const dbUtil = require('../../utils/db')
const seed = require('../../utils/seed')
const db = dbUtil.db
const _ = db.command

// 生成 6 位邀请码（排除易混淆字符 0/O 1/I/L）
function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

Page({
  data: {
    theme: 'light',
    busy: false,
    gid: '',
    myGroups: [],
    form: { name: '', startDate: '2026-09-07', days: '7', cities: '大理,丽江,香格里拉' },
    joinCode: ''
  },

  onShow() {
    this.setData({
      theme: getApp().globalData.theme,
      gid: dbUtil.gid(),
      myGroups: wx.getStorageSync('groupList') || []
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1, theme: getApp().globalData.theme })
    }
  },

  applyTheme(theme) {
    this.setData({ theme: theme })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ theme: theme })
    }
  },

  onFormName(e) { this.setData({ 'form.name': e.detail.value }) },
  onFormDate(e) { this.setData({ 'form.startDate': e.detail.value }) },
  onFormDays(e) { this.setData({ 'form.days': e.detail.value }) },
  onFormCities(e) { this.setData({ 'form.cities': e.detail.value }) },
  onJoinInput(e) { this.setData({ joinCode: (e.detail.value || '').toUpperCase() }) },

  // 生成不重复的邀请码
  async uniqueCode() {
    for (let i = 0; i < 5; i++) {
      const c = genCode()
      try {
        const r = await db.collection('groups').where({ code: c }).count()
        if (!r.total) return c
      } catch (e) {
        return c // 查询失败就用当前码，撞码概率极低
      }
    }
    return genCode()
  },

  // 把没有 gid 的老数据（trips / checklist）归到指定组
  async claimLegacy(gid) {
    const cols = ['trips', 'checklist']
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]
      try {
        const list = await dbUtil.fetchAll(col, 'order', 'asc', { gid: _.exists(false) })
        for (let j = 0; j < list.length; j++) {
          try {
            await db.collection(col).doc(list[j]._id).update({ data: { gid: gid } })
          } catch (e) {}
        }
      } catch (e) {}
    }
  },

  // 保存当前组并进入行程页
  enterGroup(item, fullDoc) {
    wx.setStorageSync('gid', item.id)
    wx.setStorageSync('currentGroup', fullDoc || item)
    let list = wx.getStorageSync('groupList') || []
    const idx = list.findIndex(function (g) { return g.id === item.id })
    if (idx > -1) list[idx] = item
    else list.push(item)
    wx.setStorageSync('groupList', list)
    wx.hideLoading()
    this.setData({ busy: false })
    wx.switchTab({ url: '/pages/plan/plan' })
  },

  async onCreate() {
    if (this.data.busy) return
    const f = this.data.form
    const name = (f.name || '').trim()
    if (!name) {
      wx.showToast({ title: '给行程起个名字吧', icon: 'none' })
      return
    }
    const days = Math.min(15, Math.max(1, parseInt(f.days, 10) || 7))
    const cities = (f.cities || '').split(/[,，、\s]+/).filter(Boolean).slice(0, 5)
    this.setData({ busy: true })
    wx.showLoading({ title: '创建中', mask: true })
    try {
      const code = await this.uniqueCode()
      const doc = {
        name: name,
        code: code,
        createdBy: getApp().globalData.openid || '',
        createdAt: Date.now(),
        startDate: f.startDate,
        totalDays: days,
        cities: cities,
        labels: seed.dayLabels(days),
        template: ''
      }
      const addRes = await db.collection('groups').add({ data: doc })
      const gid = addRes._id

      // 检测既有未分组数据（滇西北老数据），询问是否并入
      let legacyTrips = 0
      try {
        const cnt = await db.collection('trips').where({ gid: _.exists(false) }).count()
        legacyTrips = cnt.total
      } catch (e) {}
      let claim = false
      if (legacyTrips > 0) {
        wx.hideLoading()
        claim = await new Promise(function (resolve) {
          wx.showModal({
            title: '发现现有行程数据',
            content: '检测到 ' + legacyTrips + ' 条未分组的行程（大理·丽江·香格里拉），并入「' + name + '」吗？',
            confirmText: '并入',
            cancelText: '不用',
            success: function (r) { resolve(!!r.confirm) },
            fail: function () { resolve(false) }
          })
        })
        wx.showLoading({ title: '迁移中', mask: true })
      }
      if (claim) {
        await this.claimLegacy(gid)
        // 天数一致时沿用滇西北模板的日标签；清单也走完整版
        const patch = { template: 'dianxi' }
        if (days === 7) {
          patch.labels = seed.DAY_LABELS
          doc.labels = seed.DAY_LABELS
        }
        doc.template = 'dianxi'
        try {
          await db.collection('groups').doc(gid).update({ data: patch })
        } catch (e) {}
      }
      doc._id = gid
      this.enterGroup({ id: gid, name: name, code: code }, doc)
    } catch (e) {
      wx.hideLoading()
      this.setData({ busy: false })
      dbUtil.showDbError('创建失败', e)
    }
  },

  async onJoin() {
    if (this.data.busy) return
    const code = (this.data.joinCode || '').trim().toUpperCase()
    if (code.length < 4) {
      wx.showToast({ title: '输入 6 位邀请码', icon: 'none' })
      return
    }
    this.setData({ busy: true })
    wx.showLoading({ title: '查找中', mask: true })
    try {
      const res = await db.collection('groups').where({ code: code }).limit(1).get()
      if (!res.data.length) {
        wx.hideLoading()
        this.setData({ busy: false })
        wx.showToast({ title: '没找到这个行程组', icon: 'none' })
        return
      }
      const g = res.data[0]
      this.enterGroup({ id: g._id, name: g.name, code: g.code }, g)
    } catch (e) {
      wx.hideLoading()
      this.setData({ busy: false })
      dbUtil.showDbError('加入失败', e)
    }
  },

  onSwitch(e) {
    if (this.data.busy) return
    const id = e.currentTarget.dataset.id
    const item = this.data.myGroups.find(function (g) { return g.id === id })
    if (!item) return
    this.setData({ busy: true })
    wx.showLoading({ title: '切换中', mask: true })
    this.enterGroup(item)
  },

  onCopyCode(e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    wx.setClipboardData({ data: code })
  },

  // 长按：仅从本机列表移除（不删云端数据，凭邀请码可再次加入）
  onForget(e) {
    const that = this
    const id = e.currentTarget.dataset.id
    const item = this.data.myGroups.find(function (g) { return g.id === id })
    if (!item) return
    wx.showModal({
      title: '从本机移除？',
      content: '只是不再显示在「我的行程组」里，云端数据不受影响，凭邀请码可随时再次加入。',
      confirmColor: '#D63031',
      success: function (r) {
        if (!r.confirm) return
        let list = (wx.getStorageSync('groupList') || []).filter(function (g) { return g.id !== id })
        wx.setStorageSync('groupList', list)
        if (id === that.data.gid) {
          wx.removeStorageSync('gid')
          wx.removeStorageSync('currentGroup')
          that.setData({ gid: '', myGroups: list })
        } else {
          that.setData({ myGroups: list })
        }
      }
    })
  },

  onEnterPlan() {
    wx.switchTab({ url: '/pages/plan/plan' })
  },

  noop() {}
})
