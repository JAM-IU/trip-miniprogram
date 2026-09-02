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

// 初始行程（level: must必去 / rec推荐 / opt可选；lat/lng 用于一键导航）
const seedTrips = [
  { day: 1, date: '9/7 周日', time: '16:40', title: '落地大理机场', desc: '机场直接取租车，开启自驾', level: 'must', fee: '免费', order: 100, lat: 25.6494, lng: 100.3194 },
  { day: 1, date: '9/7 周日', time: '傍晚', title: '入住酒店', desc: '建议住大理古城或洱海边', level: 'rec', fee: '', order: 101 },
  { day: 1, date: '9/7 周日', time: '晚上', title: '大理古城', desc: '逛人民路、洋人街，吃烤乳扇', level: 'must', fee: '免费', order: 102, lat: 25.6937, lng: 100.1615 },

  { day: 2, date: '9/8 周一', time: '全天', title: '环洱海自驾', desc: '海西田园风光 + 海东看落日，约120km', level: 'must', fee: '免费', order: 200, lat: 25.8013, lng: 100.1879 },
  { day: 2, date: '9/8 周一', time: '中午', title: '喜洲古镇', desc: '小火车穿麦田拍照，吃喜洲粑粑', level: 'must', fee: '免费', order: 201, lat: 25.8577, lng: 100.1042 },
  { day: 2, date: '9/8 周一', time: '', title: '苍山', desc: '9月无雪不建议登，登山留给香格里拉', level: 'opt', fee: '', order: 202, lat: 25.6620, lng: 100.1140 },

  { day: 3, date: '9/9 周二', time: '上午', title: '出发去丽江', desc: '车程约2.5小时', level: 'must', fee: '', order: 300 },
  { day: 3, date: '9/9 周二', time: '下午', title: '大研古城', desc: '最热闹：四方街、木府、酒吧街', level: 'rec', fee: '免费', order: 301, lat: 26.8721, lng: 100.2296 },
  { day: 3, date: '9/9 周二', time: '傍晚', title: '束河古镇', desc: '安静，适合慢逛', level: 'rec', fee: '免费', order: 302, lat: 26.9170, lng: 100.2040 },
  { day: 3, date: '9/9 周二', time: '晚上', title: '白沙古镇', desc: '最原始，游客少，看雪山咖啡馆', level: 'rec', fee: '免费', order: 303, lat: 26.9544, lng: 100.1933 },

  { day: 4, date: '9/10 周三', time: '全天', title: '玉龙雪山', desc: '门票+索道约160元，需提前抢票', level: 'opt', fee: '约160元', order: 400, lat: 27.0995, lng: 100.1780 },
  { day: 4, date: '9/10 周三', time: '全天', title: '蓝月谷 + 云杉坪', desc: '走中索道，水色绝美，高山草甸', level: 'rec', fee: '中索道', order: 401, lat: 27.1165, lng: 100.1835 },
  { day: 4, date: '9/10 周三', time: '下午', title: '玉湖村', desc: '不登雪山免费观景，拍照绝佳', level: 'must', fee: '免费', order: 402, lat: 27.0222, lng: 100.2111 },
  { day: 4, date: '9/10 周三', time: '', title: '泸沽湖（待定）', desc: '单程4小时需加1-2天，看时间再定', level: 'opt', fee: '100+元', order: 403, lat: 27.7036, lng: 100.7842 },

  { day: 5, date: '9/11 周四', time: '上午', title: '虎跳峡', desc: '金沙江最窄处，气势磅礴', level: 'rec', fee: '约45元', order: 500, lat: 27.1856, lng: 100.0956 },
  { day: 5, date: '9/11 周四', time: '途中', title: '哈巴雪山观景', desc: '沿途远眺，随时停车拍照', level: 'opt', fee: '免费', order: 501, lat: 27.3167, lng: 100.0833 },
  { day: 5, date: '9/11 周四', time: '下午', title: '白水台', desc: '"中国棉花堡"，出片圣地', level: 'opt', fee: '约30元', order: 502, lat: 27.5792, lng: 100.0753 },
  { day: 5, date: '9/11 周四', time: '晚上', title: '独克宗古城', desc: '逛古城，转大转经筒，吃牦牛火锅', level: 'must', fee: '免费', order: 503, lat: 27.8206, lng: 99.7089 },

  { day: 6, date: '9/12 周五', time: '上午', title: '纳帕海', desc: '环湖自驾，草原湖泊牛羊成群', level: 'must', fee: '免费', order: 600, lat: 27.8744, lng: 99.6456 },
  { day: 6, date: '9/12 周五', time: '下午', title: '松赞林寺', desc: '"小布达拉宫"，金顶红墙很出片', level: 'rec', fee: '约90元', order: 601, lat: 27.8667, lng: 99.7083 },
  { day: 6, date: '9/12 周五', time: '', title: '普达措（可选）', desc: '高原湖泊森林，体力好可选', level: 'opt', fee: '约130元', order: 602, lat: 27.8300, lng: 99.9700 },

  { day: 7, date: '9/13 周六', time: '凌晨', title: '梅里雪山 · 日照金山', desc: '飞来寺观景，需早起，可遇不可求', level: 'rec', fee: '观景台', order: 700, lat: 28.4194, lng: 98.9053 },
  { day: 7, date: '9/13 周六', time: '', title: '返程', desc: '香格里拉或丽江机场还车返程', level: 'must', fee: '', order: 701 }
]

// 标题 -> 坐标（给已初始化的老数据回填导航点用）
const SPOT_COORDS = {}
seedTrips.forEach(function (t) {
  if (t.lat && t.lng) SPOT_COORDS[t.title] = { lat: t.lat, lng: t.lng }
})

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

// ===== 携带清单 =====
// 分组（展示顺序即数组顺序）
const PACK_CATS = [
  { key: 'id', label: '证件资金' },
  { key: 'cloth', label: '衣物穿搭' },
  { key: 'care', label: '防晒洗护' },
  { key: 'med', label: '药品防护' },
  { key: 'digital', label: '电子设备' },
  { key: 'misc', label: '其他杂物' },
  { key: 'custom', label: '自定义' }
]

// 针对 9 月滇西北（高原、早晚冷、紫外线强、香格里拉高反）的默认清单
const PACK_SEED = [
  { cat: 'id', text: '身份证' },
  { cat: 'id', text: '驾驶证（自驾必带）' },
  { cat: 'id', text: '少量现金' },
  { cat: 'cloth', text: '冲锋衣 / 薄羽绒（香格里拉早晚冷）' },
  { cat: 'cloth', text: '长袖长裤' },
  { cat: 'cloth', text: '舒适徒步鞋' },
  { cat: 'cloth', text: '帽子 + 墨镜' },
  { cat: 'cloth', text: '防晒衣' },
  { cat: 'care', text: 'SPF50+ 防晒霜' },
  { cat: 'care', text: '润唇膏' },
  { cat: 'care', text: '保湿面霜 / 面膜' },
  { cat: 'care', text: '个人洗漱用品' },
  { cat: 'med', text: '感冒药' },
  { cat: 'med', text: '肠胃药' },
  { cat: 'med', text: '晕车药' },
  { cat: 'med', text: '创可贴' },
  { cat: 'med', text: '抗高反（红景天 / 葡萄糖）' },
  { cat: 'digital', text: '充电宝' },
  { cat: 'digital', text: '车载充电器' },
  { cat: 'digital', text: '数据线' },
  { cat: 'digital', text: '相机（拍日照金山）' },
  { cat: 'misc', text: '保温杯' },
  { cat: 'misc', text: '雨伞 / 雨衣' },
  { cat: 'misc', text: '零食干粮（路上补给）' },
  { cat: 'misc', text: '便携氧气瓶（香格里拉备用）' }
]

/**
 * 首次打开自动写入携带清单（固定 _id 幂等）
 * 注意：checklist 集合不存在时会抛错，调用方需自行兜底（本地模式）
 */
async function initPackIfEmpty() {
  const res = await db.collection('checklist').count()
  if (res.total > 0) return false
  for (let i = 0; i < PACK_SEED.length; i++) {
    try {
      await db.collection('checklist').add({
        data: Object.assign({
          _id: 'pack-' + (i + 1),
          done: false,
          order: (i + 1) * 10,
          createdAt: Date.now()
        }, PACK_SEED[i])
      })
    } catch (e) {
      // 已被别人初始化过，跳过
    }
  }
  return true
}

module.exports = {
  initIfEmpty: initIfEmpty,
  initPackIfEmpty: initPackIfEmpty,
  DAY_THEMES: DAY_THEMES,
  DAY_LABELS: DAY_LABELS,
  DATE_LABELS: DATE_LABELS,
  EXP_DATES: EXP_DATES,
  SPOT_COORDS: SPOT_COORDS,
  PACK_CATS: PACK_CATS,
  PACK_SEED: PACK_SEED
}
