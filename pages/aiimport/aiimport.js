// AI 行程导入：粘贴攻略 → 安全校验 → AI 解析 → 预览调整 → 批量入库
const dbUtil = require('../../utils/db')
const seed = require('../../utils/seed')
const ai = require('../../utils/ai')
const db = dbUtil.db

const LEVELS = ['must', 'rec', 'opt']

Page({
  data: {
    theme: 'light',
    stage: 'input', // input | preview
    gid: '',
    group: null,
    groupName: '',
    totalDays: 7,
    dayLabels: [],
    dateLabels: [],
    text: '',
    parsing: false,
    items: [],   // 预览条目（带稳定 key）
    groups: [],  // 按天分组后的展示结构
    importing: false
  },

  onLoad() {
    const gid = dbUtil.gid()
    if (!gid) {
      wx.reLaunch({ url: '/pages/group/group' })
      return
    }
    const group = wx.getStorageSync('currentGroup') || {}
    const totalDays = group.totalDays || 7
    this.setData({
      gid: gid,
      group: group,
      groupName: group.name || '当前行程组',
      totalDays: totalDays,
      dayLabels: (group.labels && group.labels.length) ? group.labels : seed.dayLabels(totalDays),
      dateLabels: seed.dateLabels(group.startDate, totalDays)
    })
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme })
  },

  // 系统主题变化时由 app.js 调用
  applyTheme(theme) {
    this.setData({ theme: theme })
  },

  onInput(e) {
    this.setData({ text: e.detail.value })
  },

  // 一键粘贴剪贴板
  onPaste() {
    const that = this
    wx.getClipboardData({
      success: function (res) {
        const t = (res.data || '').trim()
        if (!t) {
          wx.showToast({ title: '剪贴板是空的', icon: 'none' })
          return
        }
        that.setData({ text: t.slice(0, 3000) })
        wx.showToast({ title: '已粘贴', icon: 'none', duration: 600 })
      },
      fail: function () {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' })
      }
    })
  },

  // ===== 解析 =====
  async onParse() {
    if (this.data.parsing) return
    const text = (this.data.text || '').trim()
    if (text.length < 20) {
      wx.showToast({ title: '内容太短，先粘贴攻略文字', icon: 'none' })
      return
    }
    if (!ai.aiSupported()) {
      wx.showModal({
        title: '微信版本过低',
        content: 'AI 功能需要较新版本的微信（基础库 3.15.1+），请升级微信后再试',
        showCancel: false
      })
      return
    }

    this.setData({ parsing: true })
    wx.showLoading({ title: '安全校验中…', mask: true })
    try {
      // 1) 内容安全校验（微信要求：用户生成内容先过审）
      const sec = await wx.cloud.callFunction({
        name: 'secCheck',
        data: { content: text }
      })
      const r = sec && sec.result
      if (!r || !r.pass) {
        wx.hideLoading()
        wx.showModal({
          title: '内容未通过审核',
          content: '这段文字包含不适合的内容，请修改后再试',
          showCancel: false
        })
        return
      }

      // 2) AI 解析
      wx.showLoading({ title: 'AI 解析中…', mask: true })
      const items = await ai.parseTrips(this.data.group, text)
      wx.hideLoading()

      if (!items.length) {
        wx.showModal({
          title: '没解析出行程',
          content: 'AI 没能从这段文字里整理出有效安排，可以换一段更具体的攻略（包含每天去哪、时间等）再试',
          showCancel: false
        })
        return
      }

      const keyed = items.map(function (it, i) {
        return Object.assign({ key: 'k' + i }, it)
      })
      this.setData({
        stage: 'preview',
        items: keyed,
        groups: this.groupItems(keyed)
      })
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    } catch (e) {
      wx.hideLoading()
      const msg = dbUtil.errText(e)
      if (/not exist|FUNCTION_NOT_FOUND|-404|未找到/i.test(msg)) {
        wx.showModal({
          title: '缺少云函数 secCheck',
          content: '请先在开发者工具里上传部署云函数 secCheck（右键 cloudfunctions/secCheck → 上传并部署）',
          showCancel: false
        })
      } else {
        wx.showModal({ title: '解析失败', content: msg, showCancel: false })
      }
    } finally {
      this.setData({ parsing: false })
    }
  },

  // ===== 预览调整 =====
  groupItems(items) {
    const map = {}
    items.forEach(function (s) {
      if (!map[s.day]) map[s.day] = []
      map[s.day].push(s)
    })
    const labels = this.data.dayLabels
    const dates = this.data.dateLabels
    return Object.keys(map)
      .map(Number)
      .sort(function (a, b) { return a - b })
      .map(function (d) {
        return {
          day: d,
          label: labels[d - 1] || ('D' + d),
          date: dates[d - 1] || '',
          items: map[d]
        }
      })
  },

  refreshPreview(items) {
    this.setData({ items: items, groups: this.groupItems(items) })
  },

  // ◀ ▶ 调整条目归属的天
  onMoveDay(e) {
    const key = e.currentTarget.dataset.key
    const dir = Number(e.currentTarget.dataset.dir)
    const items = this.data.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].key === key) {
        const next = items[i].day + dir
        if (next < 1 || next > this.data.totalDays) {
          wx.showToast({ title: dir < 0 ? '已经是第一天了' : '已经是最后一天了', icon: 'none', duration: 800 })
          return
        }
        items[i].day = next
        break
      }
    }
    this.refreshPreview(items)
  },

  // 点标记循环切换：必去 → 推荐 → 可选
  onCycleLevel(e) {
    const key = e.currentTarget.dataset.key
    const items = this.data.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].key === key) {
        const idx = LEVELS.indexOf(items[i].level)
        items[i].level = LEVELS[(idx + 1) % LEVELS.length]
        break
      }
    }
    this.refreshPreview(items)
  },

  onDel(e) {
    const key = e.currentTarget.dataset.key
    const items = this.data.items.filter(function (s) { return s.key !== key })
    this.refreshPreview(items)
  },

  onReInput() {
    this.setData({ stage: 'input', items: [], groups: [] })
  },

  // ===== 确认导入 =====
  async onImport() {
    if (this.data.importing) return
    const items = this.data.items
    if (!items.length) return
    this.setData({ importing: true })
    wx.showLoading({ title: '导入中…', mask: true })
    const gid = this.data.gid
    const dates = this.data.dateLabels
    const base = Date.now()
    let ok = 0
    let fail = 0
    for (let i = 0; i < items.length; i++) {
      const s = items[i]
      try {
        await db.collection('trips').add({
          data: {
            gid: gid,
            day: s.day,
            date: dates[s.day - 1] || '',
            time: s.time,
            title: s.title,
            desc: s.desc,
            fee: s.fee,
            level: s.level,
            image: '',
            lat: '',
            lng: '',
            done: false,
            order: base + i,
            createdAt: base,
            updatedAt: base
          }
        })
        ok++
      } catch (e) {
        fail++
      }
    }
    wx.hideLoading()
    this.setData({ importing: false })
    if (!ok) {
      dbUtil.showDbError('导入失败', new Error('全部写入失败，请检查 trips 集合权限'))
      return
    }
    wx.showToast({ title: fail ? ('导入 ' + ok + ' 条，' + fail + ' 条失败') : ('已导入 ' + ok + ' 条'), icon: 'none', duration: 1600 })
    setTimeout(function () {
      wx.navigateBack({ fail: function () { wx.reLaunch({ url: '/pages/plan/plan' }) } })
    }, 1200)
  }
})
