// 图片素材映射表
const BASE = '/images/'

// 顶部大横幅背景图
const HERO_IMAGE = BASE + 'hero-meili.jpg'

// 每天主题头图（day -> 图片文件）
const DAY_IMAGES = {
  1: 'dali-erhai.jpg',        // 抵达大理 · 洱海
  2: 'xizhou.jpg',            // 环洱海 + 喜洲
  3: 'lijiang-gucheng.jpg',   // 大理 → 丽江古城
  4: 'yulongxueshan.jpg',     // 玉龙雪山
  5: 'hutiaoxia.jpg',         // 虎跳峡 / 白水台
  6: 'songzanlinsi.jpg',      // 纳帕海 + 松赞林寺
  7: 'hero-meili.jpg'         // 梅里雪山日照金山
}

// 景点标题关键词 -> 缩略图（顺序越靠前优先级越高；单字 key 放后面）
const SPOT_IMAGES = [
  // 大理
  { keys: ['环洱海'], img: 'dali-erhai.jpg' },
  { keys: ['喜洲古镇'], img: 'xizhou.jpg' },
  { keys: ['喜洲'], img: 'xizhou.jpg' },
  { keys: ['苍山'], img: 'dali-cangshan.jpg' },
  { keys: ['大理古城'], img: 'dali-gucheng.jpg' },
  { keys: ['入住酒店'], img: 'hotel.jpg' },
  { keys: ['酒店'], img: 'hotel.jpg' },
  { keys: ['大理机场'], img: 'dali-airport.jpg' },
  { keys: ['洱海'], img: 'dali-erhai.jpg' },
  // 丽江
  { keys: ['蓝月谷'], img: 'lijiang-lanyuegu.jpg' },
  { keys: ['云杉坪'], img: 'yulongxueshan.jpg' },
  { keys: ['玉龙雪山'], img: 'yulongxueshan.jpg' },
  { keys: ['哈巴雪山'], img: 'haba.jpg' },
  { keys: ['梅里雪山'], img: 'hero-meili.jpg' },
  { keys: ['日照金山'], img: 'hero-meili.jpg' },
  { keys: ['飞来寺'], img: 'hero-meili.jpg' },
  { keys: ['玉湖村'], img: 'yuhucun.jpg' },
  { keys: ['泸沽湖'], img: 'luguhu.jpg' },
  { keys: ['大研古城'], img: 'lijiang-gucheng.jpg' },
  { keys: ['束河古镇'], img: 'shuhe.jpg' },
  { keys: ['白沙古镇'], img: 'baisha.jpg' },
  { keys: ['出发去丽江'], img: 'road.jpg' },
  { keys: ['丽江古城'], img: 'lijiang-gucheng.jpg' },
  { keys: ['丽江'], img: 'lijiang-gucheng.jpg' },
  { keys: ['雪山'], img: 'yulongxueshan.jpg' },
  // 香格里拉
  { keys: ['虎跳峡'], img: 'hutiaoxia.jpg' },
  { keys: ['白水台'], img: 'baishuitai.jpg' },
  { keys: ['独克宗'], img: 'dukezong.jpg' },
  { keys: ['纳帕海'], img: 'shangrila-napahai.jpg' },
  { keys: ['松赞林寺'], img: 'songzanlinsi.jpg' },
  { keys: ['小布达拉'], img: 'songzanlinsi.jpg' },
  { keys: ['普达措'], img: 'pudacuo.jpg' },
  { keys: ['返程'], img: 'fanhui.jpg' }
]

// 配图选择库（编辑时可手动挑选；key 与文件名一一对应）
const GALLERY = [
  { key: 'dali-erhai', label: '洱海', src: BASE + 'dali-erhai.jpg' },
  { key: 'dali-gucheng', label: '大理古城', src: BASE + 'dali-gucheng.jpg' },
  { key: 'hotel', label: '洱海民宿', src: BASE + 'hotel.jpg' },
  { key: 'xizhou', label: '喜洲', src: BASE + 'xizhou.jpg' },
  { key: 'dali-cangshan', label: '苍山', src: BASE + 'dali-cangshan.jpg' },
  { key: 'road', label: '在路上', src: BASE + 'road.jpg' },
  { key: 'lijiang-gucheng', label: '丽江古城', src: BASE + 'lijiang-gucheng.jpg' },
  { key: 'shuhe', label: '束河', src: BASE + 'shuhe.jpg' },
  { key: 'lijiang-lanyuegu', label: '蓝月谷', src: BASE + 'lijiang-lanyuegu.jpg' },
  { key: 'yulongxueshan', label: '玉龙雪山', src: BASE + 'yulongxueshan.jpg' },
  { key: 'haba', label: '哈巴雪山', src: BASE + 'haba.jpg' },
  { key: 'hutiaoxia', label: '虎跳峡', src: BASE + 'hutiaoxia.jpg' },
  { key: 'baishuitai', label: '白水台', src: BASE + 'baishuitai.jpg' },
  { key: 'dukezong', label: '独克宗', src: BASE + 'dukezong.jpg' },
  { key: 'shangrila-napahai', label: '纳帕海', src: BASE + 'shangrila-napahai.jpg' },
  { key: 'songzanlinsi', label: '松赞林寺', src: BASE + 'songzanlinsi.jpg' },
  { key: 'hero-meili', label: '梅里雪山', src: BASE + 'hero-meili.jpg' },
  { key: 'dali-airport', label: '大理机场', src: BASE + 'dali-airport.jpg' },
  { key: 'yuhucun', label: '玉湖村', src: BASE + 'yuhucun.jpg' },
  { key: 'luguhu', label: '泸沽湖', src: BASE + 'luguhu.jpg' },
  { key: 'baisha', label: '白沙古镇', src: BASE + 'baisha.jpg' },
  { key: 'pudacuo', label: '普达措', src: BASE + 'pudacuo.jpg' },
  { key: 'fanhui', label: '返程公路', src: BASE + 'fanhui.jpg' }
]

/**
 * 取一条行程的配图：优先手动 image，其次按标题匹配，最后当天主题图
 */
function tripImage(trip) {
  if (trip && trip.image) return trip.image
  const auto = matchSpot(trip ? trip.title : '')
  if (auto) return auto
  return dayImage(trip ? trip.day : 1)
}

/**
 * 根据景点名称匹配缩略图，匹配不到返回空字符串
 */
function matchSpot(title) {
  title = (title || '').trim()
  if (!title) return ''
  for (let i = 0; i < SPOT_IMAGES.length; i++) {
    const keys = SPOT_IMAGES[i].keys
    for (let j = 0; j < keys.length; j++) {
      if (title.indexOf(keys[j]) > -1) {
        return BASE + SPOT_IMAGES[i].img
      }
    }
  }
  return ''
}

/**
 * 获取某天的主题头图（带兜底）
 */
function dayImage(day) {
  const f = DAY_IMAGES[day]
  return f ? BASE + f : HERO_IMAGE
}

module.exports = {
  BASE: BASE,
  HERO_IMAGE: HERO_IMAGE,
  DAY_IMAGES: DAY_IMAGES,
  GALLERY: GALLERY,
  dayImage: dayImage,
  matchSpot: matchSpot,
  tripImage: tripImage
}