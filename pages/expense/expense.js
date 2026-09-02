// 记账页
const dbUtil = require('../../utils/db')
const seed = require('../../utils/seed')
const scrollHide = require('../../utils/scrollhide')
const db = dbUtil.db

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
    loading: true,
    saving: false,
    expenses: [],
    barHidden: false,
    total: 0,
    members: [],
    memberNames: [],
    // 记账弹窗
    showForm: false,
    isNew: true,
    editId: '',
    dates: seed.EXP_DATES,
    form: { dateIdx: 0, title: '', amount: '', payerIdx: 0, memberSel: [] },
    cbMembers: [],
    // 成员弹窗
    showMembers: false,
    newName: '',
    tempAvatar: '',
    // 微信身份（openid 自动识别）
    myOpenid: '',
    myMember: null,
    joinName: '',
    joinAvatar: ''
  },

  onShow() {
    this.setData({ theme: getApp().globalData.theme })
    this.syncTabBar(1)
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

  syncTabBar(selected) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: selected, theme: getApp().globalData.theme })
    }
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const exps = await dbUtil.fetchAll('expenses', 'createdAt', 'asc')
      const mems = await dbUtil.fetchAll('members', 'createdAt', 'asc')
      // 静默拿到 openid，自动认出"我"是哪个成员
      let oid = getApp().globalData.openid
      if (!oid && getApp().globalData.openidReady) {
        oid = await getApp().globalData.openidReady
      }
      const my = oid ? mems.find(function (m) { return m.openid === oid }) : null
      let total = 0
      exps.forEach(function (e) { total += e.amount || 0 })
      total = Math.round(total * 100) / 100
      this.setData({
        expenses: exps,
        members: mems,
        memberNames: mems.map(function (m) { return m.name }),
        myOpenid: oid || '',
        myMember: my || null,
        total: 0,
        loading: false
      })
      rollNumber(this, 'total', total)
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

  refreshCbMembers(sel) {
    this.setData({
      cbMembers: this.data.members.map(function (m) {
        return { _id: m._id, name: m.name, checked: sel.indexOf(m.name) > -1 }
      })
    })
  },

  // ===== 记一笔 =====
  onAdd() {
    console.log('[记一笔] 点击已触发，当前成员数：', this.data.members.length)
    if (!this.data.members.length) {
      const that = this
      wx.showModal({
        title: '还没有成员',
        content: '记第一笔前，需要先加入同行的人（付钱的和参与平摊的）。',
        confirmText: '去添加成员',
        confirmColor: '#4F8CFF',
        success: function (r) {
          if (r.confirm) that.setData({ showMembers: true })
        }
      })
      return
    }
    const all = this.data.memberNames.slice()
    this.setData({
      showForm: true,
      isNew: true,
      editId: '',
      form: { dateIdx: 0, title: '', amount: '', payerIdx: 0, memberSel: all }
    })
    this.refreshCbMembers(all)
  },

  onEditExp(e) {
    const id = e.currentTarget.dataset.id
    const exp = this.data.expenses.find(function (x) { return x._id === id })
    if (!exp) return
    const payerIdx = Math.max(0, this.data.memberNames.indexOf(exp.payer))
    const sel = exp.members || []
    this.setData({
      showForm: true,
      isNew: false,
      editId: id,
      form: {
        dateIdx: Math.max(0, this.data.dates.indexOf(exp.date)),
        title: exp.title || '',
        amount: String(exp.amount),
        payerIdx: payerIdx,
        memberSel: sel
      }
    })
    this.refreshCbMembers(sel)
  },

  closeForm() {
    if (this.data.saving) return
    this.setData({ showForm: false })
  },

  noop() {},

  onFormDate(e) { this.setData({ 'form.dateIdx': Number(e.detail.value) }) },
  onFormTitle(e) { this.setData({ 'form.title': e.detail.value }) },
  onFormAmount(e) { this.setData({ 'form.amount': e.detail.value }) },
  onFormPayer(e) { this.setData({ 'form.payerIdx': Number(e.detail.value) }) },
  onFormMembers(e) {
    this.setData({ 'form.memberSel': e.detail.value })
    this.refreshCbMembers(e.detail.value)
  },

  async onSaveExp() {
    if (this.data.saving) return
    const f = this.data.form
    const title = (f.title || '').trim()
    const amount = parseFloat(f.amount)
    if (!title) {
      wx.showToast({ title: '写个项目名吧', icon: 'none' })
      return
    }
    if (!(amount > 0)) {
      wx.showToast({ title: '金额好像不对', icon: 'none' })
      return
    }
    if (!this.data.members.length) {
      wx.showToast({ title: '请先添加成员', icon: 'none' })
      return
    }
    const payer = this.data.members[f.payerIdx] ? this.data.members[f.payerIdx].name : ''
    const members = f.memberSel
    if (!payer || !members.length) {
      wx.showToast({ title: '选一下谁付的、谁参与', icon: 'none' })
      return
    }
    const payload = {
      date: this.data.dates[f.dateIdx],
      title: title,
      amount: Math.round(amount * 100) / 100,
      payer: payer,
      members: members,
      updatedAt: Date.now()
    }
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中', mask: true })
    try {
      if (this.data.isNew) {
        payload.createdAt = Date.now()
        await db.collection('expenses').add({ data: payload })
      } else {
        await db.collection('expenses').doc(this.data.editId).update({ data: payload })
      }
      wx.hideLoading()
      this.setData({ showForm: false, saving: false })
      wx.showToast({ title: '已记账', icon: 'success', duration: 1200 })
      this.loadData()
    } catch (e) {
      wx.hideLoading()
      this.setData({ saving: false })
      dbUtil.showDbError('保存失败', e)
    }
  },

  onDeleteExp() {
    const that = this
    wx.showModal({
      title: '删除这笔账？',
      content: '删除后无法恢复',
      confirmColor: '#D63031',
      success: async function (r) {
        if (!r.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await db.collection('expenses').doc(that.data.editId).remove()
          wx.hideLoading()
          that.setData({ showForm: false })
          that.loadData()
        } catch (e) {
          wx.hideLoading()
          dbUtil.showDbError('删除失败', e)
        }
      }
    })
  },

  // ===== 成员管理 =====
  toggleMembers() {
    this.setData({ showMembers: !this.data.showMembers, newName: '', tempAvatar: '', joinName: '', joinAvatar: '' })
  },

  onNewName(e) {
    this.setData({ newName: e.detail.value })
  },

  // 选择微信头像
  onChooseAvatar(e) {
    this.setData({ tempAvatar: e.detail.avatarUrl })
  },

  // 上传头像（免费套餐存储受限时静默跳过，不影响加人）
  async tryUploadAvatar(tempPath) {
    try {
      const ext = (tempPath.match(/\.(\w+)$/) || [])[1] || 'jpg'
      const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '.' + ext
      const up = await wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: tempPath })
      return (up && up.fileID) || ''
    } catch (e) {
      return ''
    }
  },

  async onAddMember() {
    const name = (this.data.newName || '').trim()
    if (!name) {
      wx.showToast({ title: '输入名字或外号', icon: 'none' })
      return
    }
    if (this.data.memberNames.indexOf(name) > -1) {
      wx.showToast({ title: '已经有这个人啦', icon: 'none' })
      return
    }
    wx.showLoading({ title: '添加中', mask: true })
    try {
      const data = { name: name, createdAt: Date.now() }
      if (this.data.tempAvatar) {
        const fid = await this.tryUploadAvatar(this.data.tempAvatar)
        if (fid) data.avatar = fid
      }
      await db.collection('members').add({ data: data })
      wx.hideLoading()
      this.setData({ newName: '', tempAvatar: '' })
      this.loadData()
    } catch (e) {
      wx.hideLoading()
      dbUtil.showDbError('添加失败', e)
    }
  },

  // ===== 微信一键加入 =====
  onJoinAvatar(e) {
    this.setData({ joinAvatar: e.detail.avatarUrl })
  },

  onJoinName(e) {
    this.setData({ joinName: e.detail.value })
  },

  async onJoinWechat() {
    const name = (this.data.joinName || '').trim()
    if (!name) {
      wx.showToast({ title: '先填一下昵称', icon: 'none' })
      return
    }
    const oid = this.data.myOpenid
    wx.showLoading({ title: '加入中', mask: true })
    try {
      // 同名成员已存在（比如别人提前把你加好了）→ 直接绑定 openid 认领
      const exist = this.data.members.find(function (m) { return m.name === name })
      if (exist) {
        await db.collection('members').doc(exist._id).update({ data: { openid: oid } })
        wx.hideLoading()
        this.setData({ joinName: '', joinAvatar: '' })
        wx.showToast({ title: '已认领「' + name + '」', icon: 'none' })
        this.loadData()
        return
      }
      const data = { name: name, openid: oid, createdAt: Date.now() }
      if (this.data.joinAvatar) {
        const fid = await this.tryUploadAvatar(this.data.joinAvatar)
        if (fid) data.avatar = fid
      }
      await db.collection('members').add({ data: data })
      wx.hideLoading()
      this.setData({ joinName: '', joinAvatar: '' })
      wx.showToast({ title: '加入成功', icon: 'success' })
      this.loadData()
    } catch (e) {
      wx.hideLoading()
      dbUtil.showDbError('加入失败', e)
    }
  },

  onRemoveMember(e) {
    const that = this
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除该成员？',
      content: '已记录的账单不受影响，只是名单里少一个人',
      confirmColor: '#D63031',
      success: async function (r) {
        if (!r.confirm) return
        try {
          await db.collection('members').doc(id).remove()
          that.loadData()
        } catch (e) {
          dbUtil.showDbError('删除失败', e)
        }
      }
    })
  }
})
