// 行程页
const dbUtil = require('../../utils/db')
const seed = require('../../utils/seed')
const imgs = require('../../utils/imgs')
const scrollHide = require('../../utils/scrollhide')
const db = dbUtil.db

// 从旧的费用文字里解析金额（编辑老数据时预填）
function parseAmount(fee) {
  if (!fee) return ''
  if (fee.indexOf('免费') > -1) return ''
  const m = (fee || '').match(/(\d+(?:\.\d+)?)/)
  return m ? m[1] : ''
}

// 把已存的 image 值换算成选择状态 key（auto / 库内 key）
function imageSelOf(img) {
  if (!img) return 'auto'
  if (img.indexOf('/images/') > -1) {
    const name = img.split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i, '')
    return name
  }
  return 'auto'
}

// 出发倒计时 + 行程进度点 + 打卡统计
function buildCountdown(days, dayLabels) {
  const start = new Date('2026/09/07 00:00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((start - today.getTime()) / 86400000)

  let doneCount = 0
  let totalCount = 0
  days.forEach(function (d) {
    d.items.forEach(function (s) {
      totalCount++
      if (s.done) doneCount++
    })
  })

  const cd = { mode: 'before', days: 0, title: '', sub: '', dots: [], doneCount: doneCount, totalCount: totalCount }
  if (diff > 0) {
    cd.mode = 'before'
    cd.days = diff
    cd.title = '距出发还有'
    cd.sub = '9月7日 落地大理 · 准备好行囊'
  } else if (diff > -7) {
    cd.mode = 'during'
    cd.days = 1 - diff // 1..7
    cd.title = '旅行进行中 · 第 ' + cd.days + ' 天'
    cd.sub = '今天：' + (dayLabels[cd.days - 1] || ('D' + cd.days))
  } else {
    cd.mode = 'after'
    cd.title = '旅程已圆满结束'
    cd.sub = '期待下一次同行 🎉'
  }
  for (let i = 0; i < 7; i++) {
    cd.dots.push(cd.mode === 'after' ? true : (cd.mode === 'during' && i < cd.days))
  }
  return cd
}

// ===== 天气 =====
// 云函数不可用且无缓存时的 9 月气候参考
const WEATHER_FALLBACK = [
  { name: '大理', text: '多云', temp: '24', low: '15', high: '26' },
  { name: '丽江', text: '多云', temp: '22', low: '12', high: '24' },
  { name: '香格里拉', text: '阵雨', temp: '15', low: '6', high: '17' }
]

function weatherIcon(text) {
  const t = text || ''
  if (/雷/.test(t)) return '⛈️'
  if (/雪/.test(t)) return '🌨️'
  if (/雨/.test(t)) return '🌧️'
  if (/雾|霾/.test(t)) return '🌫️'
  if (/阴/.test(t)) return '☁️'
  if (/多云/.test(t)) return '⛅'
  if (/晴/.test(t)) return '☀️'
  return '🌤️'
}

function weatherTip(items) {
  const tips = []
  let rain = false
  let cold = false
  items.forEach(function (c) {
    if (/雨|雪|雷/.test(c.text || '')) rain = true
    if (c.name === '香格里拉' && Number(c.low) <= 10) cold = true
  })
  if (rain) tips.push('部分地区有雨，雨具别落下')
  if (cold) tips.push('香格里拉早晚冷，厚外套必备')
  tips.push('高原紫外线强，注意防晒')
  return tips.slice(0, 2).join(' · ')
}

Page({
  data: {
    theme: 'light',
    loading: true,
    saving: false,
    days: [],
    barHidden: false,
    countdown: null,
    heroImage: imgs.HERO_IMAGE,
    weather: null,
    // 携带清单
    pack: { show: false, groups: [], doneCount: 0, totalCount: 0 },
    packInput: '',
    packLocal: false,
    // 成员（用于"谁付的""参与平摊"）
    members: [],
    memberNames: [],
    payerNames: [],
    cbMembers: [],
    // 编辑弹窗
    showEdit: false,
    isNew: true,
    editId: '',
    form: { day: 1, time: '', title: '', desc: '', level: 'rec', amount: '', payerIdx: 0, memberSel: [], image: '', imageSel: 'auto', lat: '', lng: '' },
    gallery: imgs.GALLERY,
    dayLabels: seed.DAY_LABELS,
    levels: [
      { key: 'must', label: '必去' },
      { key: 'rec', label: '推荐' },
      { key: 'opt', label: '可选' }
    ]
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme })
    this.syncTabBar(0)
    scrollHide.reset(this)
    this.loadData()
    this.loadWeather()
    this.loadPack()
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

  syncTabBar(selected) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: selected, theme: getApp().globalData.theme })
    }
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      await seed.initIfEmpty()
      const list = await dbUtil.fetchAll('trips', 'order', 'asc')
      // 拉成员（成员集合可能还没建，容错为空，不影响行程展示）
      let mems = []
      try {
        mems = await dbUtil.fetchAll('members', 'createdAt', 'asc')
      } catch (e) {
        mems = []
      }
      const memberNames = mems.map(function (m) { return m.name })
      // 老数据回填导航坐标（按标题精确匹配，静默写库）
      list.forEach(function (t) {
        if (!t.lat && seed.SPOT_COORDS[t.title]) {
          const c = seed.SPOT_COORDS[t.title]
          t.lat = c.lat
          t.lng = c.lng
          db.collection('trips').doc(t._id).update({ data: { lat: c.lat, lng: c.lng } }).catch(function () {})
        }
      })
      const dayMap = {}
      list.forEach(function (t) {
        if (!dayMap[t.day]) dayMap[t.day] = []
        dayMap[t.day].push(t)
      })
      const days = Object.keys(dayMap)
        .map(Number)
        .sort(function (a, b) { return a - b })
        .map(function (d) {
          const items = dayMap[d].map(function (t) {
          return Object.assign({}, t, { thumb: imgs.tripImage(t) })
        })
          return {
            day: d,
            theme: seed.DAY_THEMES[d] || 'dali',
            label: seed.DAY_LABELS[d - 1] || ('D' + d),
            date: (dayMap[d][0] && dayMap[d][0].date) || seed.DATE_LABELS[d - 1] || '',
            headImage: (items[0] && items[0].thumb) || imgs.dayImage(d),
            items: items
          }
        })
      this.setData({
        days: days,
        members: mems,
        memberNames: memberNames,
        payerNames: ['不记账'].concat(memberNames),
        countdown: buildCountdown(days, seed.DAY_LABELS),
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      dbUtil.showDbError('加载失败', e)
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

  // ===== 天气 =====
  setWeather(list, at, isRef) {
    const items = list.map(function (c) {
      return {
        name: c.name,
        text: c.text,
        icon: weatherIcon(c.text),
        temp: c.temp,
        low: c.low,
        high: c.high
      }
    })
    let timeStr = ''
    if (isRef) timeStr = '9月气候参考'
    else if (at) {
      const d = new Date(at)
      timeStr = '更新于 ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)
    }
    this.setData({ weather: { items: items, tip: weatherTip(items), timeStr: timeStr } })
  },

  async loadWeather() {
    // 1) 先读缓存立即展示（离线也有内容）
    const cache = wx.getStorageSync('weatherCache')
    const hasCache = cache && cache.list && cache.list.length
    if (hasCache) this.setWeather(cache.list, cache.at, false)
    // 2) 调云函数刷新（云函数内访问外网，不受合法域名限制）
    try {
      const res = await wx.cloud.callFunction({ name: 'weather' })
      const list = res && res.result && res.result.list
      if (!list || !list.length) throw new Error('empty weather')
      const at = (res.result && res.result.at) || Date.now()
      wx.setStorageSync('weatherCache', { list: list, at: at })
      this.setWeather(list, at, false)
    } catch (e) {
      // 3) 失败：有缓存用缓存，否则给 9 月气候参考
      if (!hasCache) this.setWeather(WEATHER_FALLBACK, 0, true)
    }
  },

  // ===== 携带清单 =====
  renderPack(list, isLocal) {
    this._packList = list
    const groups = []
    seed.PACK_CATS.forEach(function (c) {
      const items = list.filter(function (x) { return x.cat === c.key })
      if (items.length) groups.push({ key: c.key, label: c.label, items: items })
    })
    let done = 0
    list.forEach(function (x) { if (x.done) done++ })
    this.setData({
      packLocal: isLocal,
      'pack.groups': groups,
      'pack.doneCount': done,
      'pack.totalCount': list.length
    })
  },

  async loadPack() {
    try {
      // 云端共享清单：所有人看到同一份（集合需先在云开发控制台创建）
      await seed.initPackIfEmpty()
      const list = await dbUtil.fetchAll('checklist', 'order', 'asc')
      this.renderPack(list, false)
    } catch (e) {
      // 集合未建/无权限 → 本地模式（只存在自己手机，不影响其他功能）
      let list = wx.getStorageSync('packLocal')
      if (!list || !list.length) {
        list = seed.PACK_SEED.map(function (it, i) {
          return { _id: 'local-' + (i + 1), cat: it.cat, text: it.text, done: false, order: (i + 1) * 10 }
        })
        wx.setStorageSync('packLocal', list)
      }
      this.renderPack(list, true)
    }
  },

  onOpenPack() {
    this.setData({ 'pack.show': true })
  },

  onClosePack() {
    this.setData({ 'pack.show': false })
  },

  onPackInput(e) {
    this.setData({ packInput: e.detail.value })
  },

  // 勾选 / 取消勾选
  async onTogglePack(e) {
    const id = e.currentTarget.dataset.id
    const list = this._packList || []
    let target = null
    for (let i = 0; i < list.length; i++) {
      if (list[i]._id === id) { target = list[i]; break }
    }
    if (!target) return
    const next = !target.done
    target.done = next
    this.renderPack(list, this.data.packLocal)
    if (this.data.packLocal) {
      wx.setStorageSync('packLocal', list)
      return
    }
    try {
      await db.collection('checklist').doc(id).update({ data: { done: next } })
    } catch (err) {
      target.done = !next
      this.renderPack(list, false)
      dbUtil.showDbError('更新失败', err)
    }
  },

  // 添加自定义项
  async onAddPack() {
    const text = (this.data.packInput || '').trim()
    if (!text) {
      wx.showToast({ title: '写点要带的东西', icon: 'none' })
      return
    }
    const list = this._packList || []
    if (this.data.packLocal) {
      list.push({ _id: 'local-' + Date.now(), cat: 'custom', text: text, done: false, order: Date.now() })
      wx.setStorageSync('packLocal', list)
      this.setData({ packInput: '' })
      this.renderPack(list, true)
      return
    }
    try {
      const res = await db.collection('checklist').add({
        data: { cat: 'custom', text: text, done: false, order: Date.now(), createdAt: Date.now() }
      })
      list.push({ _id: res._id, cat: 'custom', text: text, done: false, order: Date.now() })
      this.setData({ packInput: '' })
      this.renderPack(list, false)
    } catch (err) {
      dbUtil.showDbError('添加失败', err)
    }
  },

  // 长按删除
  onDelPack(e) {
    const that = this
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除这项？',
      content: '删除后清单里不再有这一项',
      confirmColor: '#D63031',
      success: async function (r) {
        if (!r.confirm) return
        let list = that._packList || []
        if (that.data.packLocal) {
          list = list.filter(function (x) { return x._id !== id })
          wx.setStorageSync('packLocal', list)
          that._packList = list
          that.renderPack(list, true)
          return
        }
        try {
          await db.collection('checklist').doc(id).remove()
          list = list.filter(function (x) { return x._id !== id })
          that.renderPack(list, false)
        } catch (err) {
          dbUtil.showDbError('删除失败', err)
        }
      }
    })
  },

  // 长按卡片：打卡 / 取消打卡
  async onToggleDone(e) {
    const id = e.currentTarget.dataset.id
    const trip = this.findTrip(id)
    if (!trip) return
    const next = !trip.done
    // 先本地即时反馈，再写库
    trip.done = next
    this.setData({ days: this.data.days, countdown: buildCountdown(this.data.days, seed.DAY_LABELS) })
    wx.showToast({ title: next ? '已打卡 ✅' : '已取消打卡', icon: 'none', duration: 900 })
    try {
      await db.collection('trips').doc(id).update({ data: { done: next, updatedAt: Date.now() } })
    } catch (err) {
      // 写库失败回滚
      trip.done = !next
      this.setData({ days: this.data.days, countdown: buildCountdown(this.data.days, seed.DAY_LABELS) })
      dbUtil.showDbError('打卡失败', err)
    }
  },

  // 卡片上的导航按钮
  onNavSpot(e) {
    const id = e.currentTarget.dataset.id
    const trip = this.findTrip(id)
    if (!trip || !trip.lat || !trip.lng) return
    wx.openLocation({
      latitude: Number(trip.lat),
      longitude: Number(trip.lng),
      name: trip.title || '目的地',
      scale: 15,
      fail: function () {
        wx.showToast({ title: '打开地图失败', icon: 'none' })
      }
    })
  },

  refreshCbMembers(sel) {
    this.setData({
      cbMembers: this.data.members.map(function (m) {
        return { _id: m._id, name: m.name, checked: sel.indexOf(m.name) > -1 }
      })
    })
  },

  // ===== 编辑弹窗 =====
  onEditItem(e) {
    const id = e.currentTarget.dataset.id
    console.log('[行程] 点击触发, id=', id)
    const trip = this.findTrip(id)
    if (!trip) {
      console.warn('[行程] 找不到对应行程, id=', id)
      return
    }
    const memberNames = this.data.memberNames
    const payerIdx = trip.payer ? Math.max(0, memberNames.indexOf(trip.payer) + 1) : 0
    const sel = (trip.members && trip.members.length) ? trip.members : memberNames.slice()
    const amount = (trip.amount !== undefined && trip.amount !== null && trip.amount !== '')
      ? String(trip.amount)
      : parseAmount(trip.fee || '')
    this.setData({
      showEdit: true,
      isNew: false,
      editId: id,
      form: {
        day: trip.day,
        time: trip.time || '',
        title: trip.title || '',
        desc: trip.desc || '',
        level: trip.level || 'rec',
        amount: amount,
        payerIdx: payerIdx,
        memberSel: sel,
        image: trip.image || '',
        imageSel: imageSelOf(trip.image),
        lat: trip.lat || '',
        lng: trip.lng || ''
      }
    })
    this.refreshCbMembers(sel)
  },

  onAddItem(e) {
    const day = Number(e.currentTarget.dataset.day) || 1
    const all = this.data.memberNames.slice()
    this.setData({
      showEdit: true,
      isNew: true,
      editId: '',
      form: { day: day, time: '', title: '', desc: '', level: 'rec', amount: '', payerIdx: 0, memberSel: all, image: '', imageSel: 'auto', lat: '', lng: '' }
    })
    this.refreshCbMembers(all)
  },

  closeEdit() {
    if (this.data.saving) return
    this.setData({ showEdit: false })
  },

  noop() {},

  onFormTitle(e) { this.setData({ 'form.title': e.detail.value }) },
  onFormTime(e) { this.setData({ 'form.time': e.detail.value }) },
  onFormDesc(e) { this.setData({ 'form.desc': e.detail.value }) },
  onFormAmount(e) { this.setData({ 'form.amount': e.detail.value }) },
  onFormDay(e) { this.setData({ 'form.day': Number(e.detail.value) + 1 }) },
  onFormPayer(e) { this.setData({ 'form.payerIdx': Number(e.detail.value) }) },
  onFormLevel(e) {
    this.setData({ 'form.level': e.currentTarget.dataset.level })
  },
  onFormMembers(e) {
    this.setData({ 'form.memberSel': e.detail.value })
    this.refreshCbMembers(e.detail.value)
  },

  // 从内置图库挑一张配图
  onPickGallery(e) {
    const key = e.currentTarget.dataset.key || 'auto'
    const src = e.currentTarget.dataset.src || ''
    this.setData({ 'form.image': src, 'form.imageSel': key })
  },

  // 打开地图选导航点
  onPickLocation() {
    const that = this
    wx.chooseLocation({
      latitude: Number(that.data.form.lat) || undefined,
      longitude: Number(that.data.form.lng) || undefined,
      success: function (res) {
        that.setData({ 'form.lat': res.latitude, 'form.lng': res.longitude })
        wx.showToast({ title: '导航点已设置', icon: 'none' })
      },
      fail: function (err) {
        if (err && err.errMsg && /cancel/i.test(err.errMsg)) return
        if (err && err.errMsg && /auth|deny|authorize/i.test(err.errMsg)) {
          wx.showModal({
            title: '需要位置权限',
            content: '请在「右上角··· → 设置」中允许使用位置信息，再来设置导航点',
            showCancel: false
          })
        }
      }
    })
  },

  onClearLocation() {
    this.setData({ 'form.lat': '', 'form.lng': '' })
  },

  async onSave() {
    if (this.data.saving) return
    const f = this.data.form
    const title = (f.title || '').trim()
    if (!title) {
      wx.showToast({ title: '写个名称吧', icon: 'none' })
      return
    }
    const amt = Math.round((parseFloat(f.amount) || 0) * 100) / 100
    const payer = f.payerIdx > 0 ? (this.data.memberNames[f.payerIdx - 1] || '') : ''
    const members = payer ? f.memberSel.slice() : []
    const fee = amt > 0 ? (amt + '元') : '免费'
    const baseData = {
      day: f.day,
      date: seed.DATE_LABELS[f.day - 1] || '',
      time: f.time,
      title: title,
      desc: f.desc,
      fee: fee,
      level: f.level,
      image: f.image || '',
      lat: f.lat || '',
      lng: f.lng || '',
      amount: amt || '',
      payer: payer || '',
      members: members,
      updatedAt: Date.now()
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中', mask: true })
    try {
      let tripId = this.data.editId
      if (this.data.isNew) {
        const addRes = await db.collection('trips').add({
          data: Object.assign({ createdAt: Date.now(), order: Date.now() }, baseData)
        })
        tripId = addRes._id
      } else {
        await db.collection('trips').doc(this.data.editId).update({ data: baseData })
      }

      // 关联账单：有金额且选了谁付的 → upsert；否则若有旧账单则删掉
      const oldTrip = this.data.isNew ? null : this.findTrip(this.data.editId)
      const oldExpenseId = oldTrip ? (oldTrip.expenseId || '') : ''
      const wantBill = amt > 0 && payer
      if (wantBill) {
        const expData = {
          date: seed.EXP_DATES[f.day - 1] || '',
          title: title,
          amount: amt,
          payer: payer,
          members: members,
          tripId: tripId,
          updatedAt: Date.now()
        }
        if (oldExpenseId) {
          await db.collection('expenses').doc(oldExpenseId).update({ data: expData })
        } else {
          const eRes = await db.collection('expenses').add({
            data: Object.assign({ createdAt: Date.now() }, expData)
          })
          await db.collection('trips').doc(tripId).update({ data: { expenseId: eRes._id } })
        }
      } else if (oldExpenseId) {
        // 取消记账：删掉旧账单并解绑
        try { await db.collection('expenses').doc(oldExpenseId).remove() } catch (e) {}
        await db.collection('trips').doc(tripId).update({ data: { expenseId: '' } })
      }

      wx.hideLoading()
      this.setData({ showEdit: false, saving: false })
      wx.showToast({ title: '已保存到 D' + f.day, icon: 'none', duration: 1500 })
      await this.loadData()
      wx.pageScrollTo({
        selector: '#day-' + f.day,
        duration: 300,
        offsetTop: -20,
        fail: function () {}
      })
    } catch (e) {
      wx.hideLoading()
      this.setData({ saving: false })
      dbUtil.showDbError('保存失败', e)
    }
  },

  onDelete() {
    const that = this
    const trip = this.findTrip(this.data.editId)
    const hasBill = trip && trip.expenseId
    wx.showModal({
      title: '删除这条安排？',
      content: hasBill ? '已关联一笔账单，将一并删除' : '删除后所有人都会看不到',
      confirmColor: '#D63031',
      success: async function (r) {
        if (!r.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        try {
          if (hasBill) {
            try { await db.collection('expenses').doc(trip.expenseId).remove() } catch (e) {}
          }
          await db.collection('trips').doc(that.data.editId).remove()
          wx.hideLoading()
          that.setData({ showEdit: false })
          that.loadData()
        } catch (e) {
          wx.hideLoading()
          dbUtil.showDbError('删除失败', e)
        }
      }
    })
  }
})