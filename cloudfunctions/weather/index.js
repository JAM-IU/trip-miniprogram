// 天气云函数：抓取 wttr.in（免费、无需 key），返回三地当日天气
// 云函数内发起外部请求不受小程序「合法域名」限制
const https = require('https')

const CITIES = [
  { name: '大理', q: 'Dali,Yunnan' },
  { name: '丽江', q: 'Lijiang,Yunnan' },
  { name: '香格里拉', q: 'Shangri-La,Yunnan' }
]

function fetchCity(city) {
  return new Promise(function (resolve) {
    const url = 'https://wttr.in/' + encodeURIComponent(city.q) + '?format=j1&lang=zh'
    const req = https.get(url, { headers: { 'User-Agent': 'curl/8.0' } }, function (res) {
      let body = ''
      res.on('data', function (d) { body += d })
      res.on('end', function () {
        try {
          const j = JSON.parse(body)
          const cur = j.current_condition && j.current_condition[0]
          const today = j.weather && j.weather[0]
          if (!cur || !today) return resolve(null)
          let text = ''
          if (cur.lang_zh && cur.lang_zh[0] && cur.lang_zh[0].value) text = cur.lang_zh[0].value
          else if (cur.weatherDesc && cur.weatherDesc[0]) text = cur.weatherDesc[0].value
          resolve({
            name: city.name,
            text: text,
            temp: cur.temp_C,
            low: today.mintempC,
            high: today.maxtempC
          })
        } catch (e) {
          resolve(null)
        }
      })
    })
    req.on('error', function () { resolve(null) })
    req.setTimeout(8000, function () { req.destroy(); resolve(null) })
  })
}

exports.main = async function () {
  const list = await Promise.all(CITIES.map(fetchCity))
  return { list: list.filter(Boolean), at: Date.now() }
}
