// 行程初始数据 + 首次打开自动初始化
const dbUtil = require('./db')
const db = dbUtil.db

// 每天主题色（大理蓝 / 丽江橙 / 香格里拉红）
const DAY_THEMES = {
  1: 'dali', 2: 'dali',
  3: 'lijiang', 4: 'lijiang',
  5: 'shangrila', 6: 'shangrila', 7: 'shangrila'
}

const DAY_LABELS = [
  'D1 · 抵达大理',
  'D2 · 环洱海 + 喜洲',
  'D3 · 大理 → 丽江',
  'D4 · 丽江雪山日',
  'D5 · 丽江 → 香格里拉',
  'D6 · 香格里拉精华',
  'D7 · 梅里 / 返程'
]

const DATE_LABELS = ['9/7 周日', '9/8 周一', '9/9 周二', '9/10 周三', '9/11 周四', '9/12 周五', '9/13 周六']

const EXP_DATES = ['9/7', '9/8', '9/9', '9/10', '9/11', '9/12', '9/13']

// 初始行程（level: must必去 / rec推荐 / opt可选）
const seedTrips = [
  { day: 1, date: '9/7 周日', time: '16:40', title: '落地大理机场', desc: '机场直接取租车，开启自驾', level: 'must', fee: '免费', order: 100 },
  { day: 1, date: '9/7 周日', time: '傍晚', title: '入住酒店', desc: '建议住大理古城或洱海边', level: 'rec', fee: '', order: 101 },
  { day: 1, date: '9/7 周日', time: '晚上', title: '大理古城', desc: '逛人民路、洋人街，吃烤乳扇', level: 'must', fee: '免费', order: 102 },

  { day: 2, date: '9/8 周一', time: '全天', title: '环洱海自驾', desc: '海西田园风光 + 海东看落日，约120km', level: 'must', fee: '免费', order: 200 },
  { day: 2, date: '9/8 周一', time: '中午', title: '喜洲古镇', desc: '小火车穿麦田拍照，吃喜洲粑粑', level: 'must', fee: '免费', order: 201 },
  { day: 2, date: '9/8 周一', time: '', title: '苍山', desc: '9月无雪不建议登，登山留给香格里拉', level: 'opt', fee: '', order: 202 },

  { day: 3, date: '9/9 周二', time: '上午', title: '出发去丽江', desc: '车程约2.5小时', level: 'must', fee: '', order: 300 },
  { day: 3, date: '9/9 周二', time: '下午', title: '大研古城', desc: '最热闹：四方街、木府、酒吧街', level: 'rec', fee: '免费', order: 301 },
  { day: 3, date: '9/9 周二', time: '傍晚', title: '束河古镇', desc: '安静，适合慢逛', level: 'rec', fee: '免费', order: 302 },
  { day: 3, date: '9/9 周二', time: '晚上', title: '白沙古镇', desc: '最原始，游客少，看雪山咖啡馆', level: 'rec', fee: '免费', order: 303 },

  { day: 4, date: '9/10 周三', time: '全天', title: '玉龙雪山', desc: '门票+索道约160元，需提前抢票', level: 'opt', fee: '约160元', order: 400 },
  { day: 4, date: '9/10 周三', time: '全天', title: '蓝月谷 + 云杉坪', desc: '走中索道，水色绝美，高山草甸', level: 'rec', fee: '中索道', order: 401 },
  { day: 4, date: '9/10 周三', time: '下午', title: '玉湖村', desc: '不登雪山免费观景，拍照绝佳', level: 'must', fee: '免费', order: 402 },
  { day: 4, date: '9/10 周三', time: '', title: '泸沽湖（待定）', desc: '单程4小时需加1-2天，看时间再定', level: 'opt', fee: '100+元', order: 403 },

  { day: 5, date: '9/11 周四', time: '上午', title: '虎跳峡', desc: '金沙江最窄处，气势磅礴', level: 'rec', fee: '约45元', order: 500 },
  { day: 5, date: '9/11 周四', time: '途中', title: '哈巴雪山观景', desc: '沿途远眺，随时停车拍照', level: 'opt', fee: '免费', order: 501 },
  { day: 5, date: '9/11 周四', time: '下午', title: '白水台', desc: '"中国棉花堡"，出片圣地', level: 'opt', fee: '约30元', order: 502 },
  { day: 5, date: '9/11 周四', time: '晚上', title: '独克宗古城', desc: '逛古城，转大转经筒，吃牦牛火锅', level: 'must', fee: '免费', order: 503 },

  { day: 6, date: '9/12 周五', time: '上午', title: '纳帕海', desc: '环湖自驾，草原湖泊牛羊成群', level: 'must', fee: '免费', order: 600 },
  { day: 6, date: '9/12 周五', time: '下午', title: '松赞林寺', desc: '"小布达拉宫"，金顶红墙很出片', level: 'rec', fee: '约90元', order: 601 },
  { day: 6, date: '9/12 周五', time: '', title: '普达措（可选）', desc: '高原湖泊森林，体力好可选', level: 'opt', fee: '约130元', order: 602 },

  { day: 7, date: '9/13 周六', time: '凌晨', title: '梅里雪山 · 日照金山', desc: '飞来寺观景，需早起，可遇不可求', level: 'rec', fee: '观景台', order: 700 },
  { day: 7, date: '9/13 周六', time: '', title: '返程', desc: '香格里拉或丽江机场还车返程', level: 'must', fee: '', order: 701 }
]

/**
 * 首次打开自动写入行程（幂等：用固定 _id，重复写入会失败并跳过，
 * 两个人同时首次打开也不会产生重复数据）
 */
async function initIfEmpty() {
  const res = await db.collection('trips').count()
  if (res.total > 0) return false
  for (let i = 0; i < seedTrips.length; i++) {
    try {
      await db.collection('trips').add({
        data: Object.assign({ _id: 'seed-' + (i + 1) }, seedTrips[i])
      })
    } catch (e) {
      // 已被别人初始化过，跳过
    }
  }
  return true
}

module.exports = {
  initIfEmpty: initIfEmpty,
  DAY_THEMES: DAY_THEMES,
  DAY_LABELS: DAY_LABELS,
  DATE_LABELS: DATE_LABELS,
  EXP_DATES: EXP_DATES
}
