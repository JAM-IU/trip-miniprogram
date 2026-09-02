// 云数据库工具
// 注意：小程序端单次 get 最多返回 20 条，行程/账单多了必须分页拉取
const db = wx.cloud.database()
const MAX = 20

/**
 * 分页拉取集合（可按条件过滤）
 * @param {string} collection 集合名
 * @param {string} orderField 排序字段
 * @param {string} orderDir asc / desc
 * @param {object} where 过滤条件，如 { gid: 'xxx' }
 */
async function fetchAll(collection, orderField, orderDir, where) {
  orderField = orderField || 'createdAt'
  orderDir = orderDir || 'asc'
  where = where || {}
  const cnt = await db.collection(collection).where(where).count()
  const total = cnt.total
  let arr = []
  const batch = Math.ceil(total / MAX) || 1
  for (let i = 0; i < batch; i++) {
    const res = await db.collection(collection)
      .where(where)
      .orderBy(orderField, orderDir)
      .skip(i * MAX)
      .limit(MAX)
      .get()
    arr = arr.concat(res.data)
    if (res.data.length < MAX) break
  }
  return arr
}

/**
 * 当前行程组 id（空字符串表示还没进组）
 */
function gid() {
  return wx.getStorageSync('gid') || ''
}

/**
 * 提取错误文本
 */
function errText(e) {
  if (!e) return '未知错误'
  if (typeof e === 'string') return e
  var t = ''
  if (e.errMsg) t += e.errMsg
  if (e.errCode !== undefined && e.errCode !== null) t += ' (code ' + e.errCode + ')'
  if (!t && e.message) t = e.message
  if (!t) {
    try { t = JSON.stringify(e) } catch (x) { t = String(e) }
  }
  return t
}

/**
 * 是否像权限错误
 */
function isPermError(e) {
  var t = errText(e)
  return /permission|denied|权限/i.test(t)
}

/**
 * 是否像"集合不存在"错误
 */
function isNoCollectionError(e) {
  var t = errText(e)
  return /not exist|not found|collection.*-501000|-501000/i.test(t)
}

/**
 * 统一的数据库错误弹窗：显示具体原因，常见问题附修复方法
 */
function showDbError(title, e) {
  var content = errText(e)
  if (isNoCollectionError(e)) {
    content += '\n\n这是集合没建导致的，修复方法：\n微信开发者工具 → 云开发 → 数据库 → 「+」创建集合，依次创建 3 个（全小写）：\ntrips / checklist / groups\n\n建完每个集合还要设权限：点进集合 → 权限设置 → 自定义安全规则，粘贴：\n{"read": true, "write": true}'
  } else if (isPermError(e)) {
    content += '\n\n这是数据库权限问题，修复方法：\n微信开发者工具 → 云开发 → 数据库 → 点进对应集合 → 权限设置(数据权限) → 自定义安全规则，粘贴：\n{"read": true, "write": true}\n\n三个集合 trips / checklist / groups 都要设置，改完点保存/发布。'
  }
  wx.showModal({
    title: title,
    content: content,
    showCancel: false
  })
}

module.exports = {
  db: db,
  fetchAll: fetchAll,
  gid: gid,
  errText: errText,
  showDbError: showDbError
}
