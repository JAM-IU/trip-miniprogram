// 云数据库工具
// 注意：小程序端单次 get 最多返回 20 条，行程/账单多了必须分页拉取
const db = wx.cloud.database()
const MAX = 20

/**
 * 分页拉取整个集合
 * @param {string} collection 集合名
 * @param {string} orderField 排序字段
 * @param {string} orderDir asc / desc
 */
async function fetchAll(collection, orderField, orderDir) {
  orderField = orderField || 'createdAt'
  orderDir = orderDir || 'asc'
  const cnt = await db.collection(collection).count()
  const total = cnt.total
  let arr = []
  const batch = Math.ceil(total / MAX) || 1
  for (let i = 0; i < batch; i++) {
    const res = await db.collection(collection)
      .orderBy(orderField, orderDir)
      .skip(i * MAX)
      .limit(MAX)
      .get()
    arr = arr.concat(res.data)
    if (res.data.length < MAX) break
  }
  return arr
}

module.exports = { db: db, fetchAll: fetchAll }
