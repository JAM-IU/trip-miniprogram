// 记账页
const dbUtil = require('../../utils/db')
const seed = require('../../utils/seed')
const db = dbUtil.db

Page({
  data: {
    loading: true,
    expenses: [],
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
    newName: ''
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const exps = await dbUtil.fetchAll('expenses', 'createdAt', 'asc')
      const mems = await dbUtil.fetchAll('members', 'createdAt', 'asc')
      let total = 0
      exps.forEach(function (e) { total += e.amount || 0 })
      this.setData({
        expenses: exps,
        members: mems,
        memberNames: mems.map(function (m) { return m.name }),
        total: Math.round(total * 100) / 100,
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showModal({
        title: '加载失败',
        content: '请确认已创建 expenses 和 members 集合（见教程第5步）。' + ((e && (e.errMsg || e.message)) || ''),
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

  refreshCbMembers(sel) {
    this.setData({
      cbMembers: this.data.members.map(function (m) {
        return { _id: m._id, name: m.name, checked: sel.indexOf(m.name) > -1 }
      })
    })
  },

  // ===== 记一笔 =====
  onAdd() {
    if (!this.data.members.length) {
      wx.showToast({ title: '先添加成员，马上就好', icon: 'none' })
      this.setData({ showMembers: true })
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
    wx.showLoading({ title: '保存中' })
    try {
      if (this.data.isNew) {
        payload.createdAt = Date.now()
        await db.collection('expenses').add({ data: payload })
      } else {
        await db.collection('expenses').doc(this.data.editId).update({ data: payload })
      }
      wx.hideLoading()
      this.setData({ showForm: false })
      this.loadData()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
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
        wx.showLoading({ title: '删除中' })
        try {
          await db.collection('expenses').doc(that.data.editId).remove()
          wx.hideLoading()
          that.setData({ showForm: false })
          that.loadData()
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        }
      }
    })
  },

  // ===== 成员管理 =====
  toggleMembers() {
    this.setData({ showMembers: !this.data.showMembers, newName: '' })
  },

  onNewName(e) {
    this.setData({ newName: e.detail.value })
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
    wx.showLoading({ title: '添加中' })
    try {
      await db.collection('members').add({ data: { name: name, createdAt: Date.now() } })
      wx.hideLoading()
      this.setData({ newName: '' })
      this.loadData()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '添加失败，请重试', icon: 'none' })
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
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
