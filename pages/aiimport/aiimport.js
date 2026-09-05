// AI 行程导入：粘贴攻略 / 攻略截图 → 安全校验 → AI 解析 → 预览调整 → 批量入库
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
    images: [], // 渲染用：[{ path, kb }]
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

  // ===== 攻略截图 =====
  async onPickImgs() {
    const remain = ai.MAX_IMAGES - this.data.images.length
    if (remain <= 0) {
      wx.showToast({ title: '最多 ' + ai.MAX_IMAGES + ' 张截图', icon: 'none' })
      return
    }
    wx.showLoading({ title: '处理图片…', mask: true })
    try {
      const picked = await ai.pickGuideImages(remain)
      wx.hideLoading()
      if (!picked.length) return
      const imgs = this.data.images.slice()
      picked.forEach((p) => {
        imgs.push({ path: p.path, kb: Math.max(1, Math.round(p.size / 1024)) })
      })
      this.setData({ images: imgs })
    } catch (e) {
      wx.hideLoading()
      const msg = dbUtil.errText(e)
      if (/cancel/i.test(msg)) return // 用户取消选图
      wx.showToast({ title: '图片处理失败', icon: 'none' })
    }
  },

  onPreviewImg(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const urls = this.data.images.map(function (x) { return x.path })
    wx.previewImage({ current: urls[idx] || urls[0], urls: urls })
  },

  onDelImg(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const imgs = this.data.images.slice()
    imgs.splice(idx, 1)
    this.setData({ images: imgs })
  },

  // ===== 解析 =====
  async onParse() {
    if (this.data.parsing) return
    const text = (this.data.text || '').trim()
    const images = this.data.images
    if (text.length < 20 && !images.length) {
      wx.showToast({ title: '粘贴攻略文字或添加截图', icon: 'none' })
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
      // 1) 文本安全校验（有实质文字才查）
      if (text.length >= 20) {
        const sec = await wx.cloud.callFunction({
          name: 'secCheck',
          data: { content: text }
        })
        const r = sec && sec.result
        if (!r || !r.pass) {
          wx.hideLoading()
          wx.showModal({
            title: '内容未通过审核',
            content: '这段文字被安全接口判定违规（' + ((r && r.reason) || 'unknown') + '），请修改后再试',
            showCancel: false
          })
          return
        }
      }

      // 2) 图片逐张安全校验（上传云存储中转，fileID 留给 aiParse 识图复用，解析完由 aiParse 删除）
      const fileIDs = []
      for (let i = 0; i < images.length; i++) {
        wx.showLoading({ title: '校验第 ' + (i + 1) + ' 张图…', mask: true })
        const fileID = await ai.uploadForCheck(images[i].path)
        fileIDs.push(fileID)
        const sec = await wx.cloud.callFunction({
          name: 'secCheck',
          data: { type: 'img', fileID: fileID }
        })
        const r = sec && sec.result
        if (!r || !r.pass) {
          wx.hideLoading()
          wx.showModal({
            title: '第 ' + (i + 1) + ' 张图未通过审核',
            content: '这张截图被安全接口判定违规（' + ((r && r.reason) || 'unknown') + '）。攻略图里如有二维码、"加微信/私信"等字样容易触发，可裁剪掉或换一张纯行程内容的截图',
            showCancel: false
          })
          return
        }
      }

      // 3) AI 解析（有图走 aiParse 云函数识图，纯文字走体验模型）
      const hasImg = images.length > 0
      wx.showLoading({ title: hasImg ? 'AI 识图中，约 20~40 秒…' : 'AI 解析中…', mask: true })
      const items = hasImg
        ? await ai.parseTripsVision(this.data.group, text, fileIDs)
        : await ai.parseTrips(this.data.group, text)
      wx.hideLoading()

      if (!items.length) {
        wx.showModal({
          title: '没解析出行程',
          content: 'AI 没能整理出有效安排，可以换一段更具体的攻略（包含每天去哪、时间等），或换更清晰的截图再试',
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
          title: '缺少云函数',
          content: '请在开发者工具里部署云函数 secCheck 和 aiParse（右键 cloudfunctions 下对应目录 → 上传并部署：云端安装依赖）',
          showCancel: false
        })
      } else if (/no-key|AI_API_KEY|未配置模型 ?Key/i.test(msg)) {
        wx.showModal({
          title: '模型 Key 未配置',
          content: '截图识别由云函数 aiParse 调用视觉模型，请配置：云开发控制台 → 云函数 → aiParse → 配置 → 环境变量添加 AI_API_KEY（智谱 Key），并把执行超时改为 60 秒',
          showCancel: false
        })
      } else if (/storage|upload|权限|permission/i.test(msg)) {
        wx.showModal({
          title: '图片上传失败',
          content: '截图需要临时上传云存储做安全校验，请检查云开发存储权限后重试',
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
