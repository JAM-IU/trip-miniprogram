// 滚动自动隐藏：下滑收起底部导航 + 页面浮动按钮，上滑/到顶恢复
// 用法：页面 data 加 barHidden:false，并添加
//   onPageScroll(e) { scrollHide.handle(this, e) }
function handle(page, e) {
  const top = (e && typeof e.scrollTop === 'number') ? e.scrollTop : 0
  const last = page._lastScrollTop || 0
  page._lastScrollTop = top
  const delta = top - last
  if (Math.abs(delta) < 10) return // 防抖：轻微抖动不处理

  let hide
  if (top <= 120) hide = false // 接近顶部永远显示
  else hide = delta > 0

  if (page._barHidden === hide) return
  page._barHidden = hide

  if (typeof page.getTabBar === 'function' && page.getTabBar()) {
    page.getTabBar().setHidden(hide)
  }
  if (page.data.barHidden !== hide) {
    page.setData({ barHidden: hide })
  }
}

// 切回页面时复位（避免停在隐藏状态）
function reset(page) {
  page._lastScrollTop = 0
  page._barHidden = false
  if (typeof page.getTabBar === 'function' && page.getTabBar()) {
    page.getTabBar().setHidden(false)
  }
  if (page.data && page.data.barHidden) {
    page.setData({ barHidden: false })
  }
}

module.exports = {
  handle: handle,
  reset: reset
}
