/**
 * @jest-environment jsdom
 */
// Loads the browser-side files as MagicMirror does (plain scripts, globals),
// then renders getDom() for a set of normalized places.
const fs = require('fs')
const path = require('path')
const placesApi = require('../placesApi.js')
const { getPlaceFromFile } = require('../testUtil.js')

const loadScript = (file) => (0, eval)(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')) // eslint-disable-line no-eval

let definition
beforeAll(() => {
  global.moment = require('moment')
  global.config = { language: 'en', timeFormat: 24 }
  global.Log = { log: () => {} }
  global.Module = { register: (name, def) => { definition = def } }
  loadScript('Parsers.js')
  loadScript('OpeningHoursLogic.js')
  loadScript('MMM-OpeningHours.js')
})

function render (places, configOverrides = {}, now = '2019-06-04T10:00', withDom = false) {
  jest.useFakeTimers()
  jest.setSystemTime(moment(now, 'YYYY-MM-DDTHH:mm').toDate())
  const translations = require('../translations/en.json')
  const module = Object.create(definition)
  module.name = 'MMM-OpeningHours'
  module.defaults = definition.defaults
  module.config = { ...definition.defaults, ...configOverrides, styling: { ...definition.defaults.styling, ...(configOverrides.styling || {}) } }
  module.translate = (key, vars = {}) => translations[key].replace(/\{(\w+)\}/g, (_, v) => vars[v])
  module.loaded = true
  module.placesOpeningHours = places
  const dom = module.getDom()
  jest.useRealTimers()
  if (withDom) return dom
  return [...dom.querySelectorAll('table.normal > tbody > tr')].map(tr => [tr.cells[0].textContent, tr.cells[1].textContent])
}

const newPlace = (file) => placesApi.normalizePlaceNew(getPlaceFromFile('mock_data/places_new/' + file).json)

test('renders open, closed, always open and N/A rows', () => {
  const rows = render([newPlace('normal.json'), newPlace('lunch_break.json'), newPlace('24hour.json'), newPlace('no_opening_hours.json')], {}, '2019-06-04T12:30')
  expect(rows).toEqual([
    ['Normal store', 'OpenCloses 22:00'],
    ['Closed for lunch', 'ClosedOpens 13:00'],
    ['24-hour store', 'Always open'],
    ['No opening hours', 'N/A']
  ])
})

test('uses alias and 12h time format', () => {
  const place = { ...newPlace('normal.json'), alias: 'My <b>shop</b>' }
  expect(render([place], { timeFormat: 12 })).toEqual([['My <b>shop</b>', 'OpenCloses 10:00 PM']])
})

test('showTimeUntil shows a positive duration until opening', () => {
  const rows = render([newPlace('lunch_break.json')], { styling: { showTimeUntil: true } }, '2019-06-04T12:30')
  expect(rows).toEqual([['Closed for lunch', 'ClosedOpens in 30 minutes']])
})

test('French translation file is registered under "fr"', () => {
  expect(definition.getTranslations().fr).toBe('translations/fr.json')
})

// 2019-06-04 is a Tuesday (day 2).
const weekly = (name, ...periods) => ({
  place_id: name,
  name,
  opening_hours: { periods: periods.map(([od, ot, cd, ct]) => ({ open: { day: od, time: ot }, close: { day: cd, time: ct } })) }
})

test('names the day when the next opening is not today', () => {
  const rows = render([
    weekly('Later today', [2, '1200', 2, '1700']),
    weekly('Tomorrow', [3, '0900', 3, '1700']),
    weekly('Friday', [5, '0900', 5, '1700'])
  ], {}, '2019-06-04T10:00')
  expect(rows).toEqual([
    ['Later today', 'ClosedOpens 12:00'],
    ['Tomorrow', 'ClosedOpens tomorrow 09:00'],
    ['Friday', 'ClosedOpens Fri 09:00']
  ])
})

test('closing after midnight shows only the time; closing days away names the day', () => {
  const rows = render([
    weekly('Night club', [2, '2000', 3, '0200']),
    weekly('Long stretch', [1, '0800', 4, '2000'])
  ], {}, '2019-06-04T21:00')
  expect(rows).toEqual([
    ['Night club', 'OpenCloses 02:00'],
    ['Long stretch', 'OpenCloses Thu 20:00']
  ])
})

test('SERVICE_FAILURE keeps showing the last known opening hours', () => {
  const module = Object.create(definition)
  module.config = { ...definition.defaults }
  module.updateDom = () => {}
  module.identifier = 'module_1'
  module.socketNotificationReceived('PLACES_UPDATE', { identifier: 'module_1', places: [newPlace('normal.json')] })
  module.socketNotificationReceived('SERVICE_FAILURE', { identifier: 'module_1', message: 'Google Places API: offline' })
  expect(module.failure).toBeUndefined()
  expect(module.placesOpeningHours).toHaveLength(1)
})

test('SERVICE_FAILURE without earlier data shows the error', () => {
  const module = Object.create(definition)
  module.config = { ...definition.defaults }
  module.updateDom = () => {}
  module.identifier = 'module_1'
  module.socketNotificationReceived('SERVICE_FAILURE', { identifier: 'module_1', message: 'Google Places API: offline' })
  expect(module.failure).toBe('Google Places API: offline')
})

test('every translation file has the same keys as English', () => {
  const en = Object.keys(require('../translations/en.json')).sort()
  Object.keys(definition.getTranslations()).forEach(lang => {
    expect([lang, Object.keys(require('../translations/' + lang + '.json')).sort()]).toEqual([lang, en])
  })
})

test('notifications for another instance are ignored', () => {
  const module = Object.create(definition)
  module.config = { ...definition.defaults }
  module.updateDom = () => {}
  module.identifier = 'module_1'
  module.socketNotificationReceived('PLACES_UPDATE', { identifier: 'module_2', places: [newPlace('normal.json')] })
  expect(module.placesOpeningHours).toBeUndefined()
})

test('SETUP sends the identifier with the config and never logs the API key', () => {
  const sent = []
  const logged = []
  const module = Object.create(definition)
  module.name = 'MMM-OpeningHours'
  module.defaults = definition.defaults
  module.identifier = 'module_7'
  module.config = { ...definition.defaults, googleApiKey: 'SECRET-KEY', places: ['a'], debug: true }
  module.translate = key => key
  module.sendSocketNotification = (notification, payload) => sent.push({ notification, payload })
  const originalLog = global.Log
  global.Log = { log: (...args) => logged.push(args) }
  jest.useFakeTimers()
  try {
    module.start()
  } finally {
    jest.clearAllTimers()
    jest.useRealTimers()
    global.Log = originalLog
  }
  expect(sent).toEqual([{ notification: 'SETUP', payload: { identifier: 'module_7', config: module.config } }])
  expect(JSON.stringify(logged)).not.toContain('SECRET-KEY')
})

describe('closing soon', () => {
  const place = weekly('Shop', [2, '0900', 2, '1800'])
  const statusClass = (configOverrides, now) =>
    render([place], configOverrides, now, true).querySelector('table.normal td table td').className

  test('is marked within closingSoonMinutes of closing', () => {
    expect(statusClass({}, '2019-06-04T17:40')).toContain('MMM-OpeningHours-closing-soon')
  })

  test('is not marked earlier', () => {
    expect(statusClass({}, '2019-06-04T17:00')).toContain('MMM-OpeningHours-open')
  })

  test('closingSoonMinutes: 0 turns it off', () => {
    expect(statusClass({ styling: { closingSoonMinutes: 0 } }, '2019-06-04T17:55')).toContain('MMM-OpeningHours-open')
  })

  test('closed places use the closed class', () => {
    expect(statusClass({}, '2019-06-04T19:00')).toContain('MMM-OpeningHours-closed')
  })
})

describe('hideClosed and sortOpenFirst', () => {
  const places = () => [
    newPlace('no_opening_hours.json'),
    weekly('Closed now', [3, '0900', 3, '1700']),
    weekly('Open now', [2, '0900', 2, '1700']),
    newPlace('24hour.json')
  ]
  const names = rows => rows.map(r => r[0])

  test('hideClosed removes only places that are closed right now', () => {
    expect(names(render(places(), { hideClosed: true }))).toEqual(['No opening hours', 'Open now', '24-hour store'])
  })

  test('sortOpenFirst puts open, then closed, then unknown, and keeps the config order within each group', () => {
    expect(names(render(places(), { sortOpenFirst: true }))).toEqual(['Open now', '24-hour store', 'Closed now', 'No opening hours'])
  })

  test('shows a message when every place is hidden', () => {
    const dom = render([weekly('Closed now', [3, '0900', 3, '1700'])], { hideClosed: true }, '2019-06-04T10:00', true)
    expect(dom.textContent).toBe('Everything is closed')
  })
})

describe('showTodaysHours', () => {
  test('lists every interval today', () => {
    const place = weekly('Lunch', [2, '0900', 2, '1200'], [2, '1300', 2, '1800'])
    expect(render([place], { styling: { showTodaysHours: true } }, '2019-06-04T10:00'))
      .toEqual([['Lunch', 'OpenCloses 12:00Today: 09:00–12:00, 13:00–18:00']])
  })

  test('says closed when there are no hours today', () => {
    const place = weekly('Weekend', [6, '1000', 6, '1600'])
    expect(render([place], { styling: { showTodaysHours: true } }, '2019-06-04T10:00'))
      .toEqual([['Weekend', 'ClosedOpens Sat 10:00Today: closed']])
  })
})

test('a place in another time zone shows its own local times', () => {
  // Open 09-17 local time in a place at UTC+9. The tests run in UTC (see jest.config.js).
  const place = { ...weekly('Tokyo shop', [2, '0900', 2, '1700'], [3, '0900', 3, '1700']), utc_offset_minutes: 9 * 60 }
  // 2019-06-04 01:00 UTC is 10:00 in the shop.
  expect(render([place], {}, '2019-06-04T01:00')).toEqual([['Tokyo shop', 'OpenCloses 17:00']])
  // 09:00 UTC is 18:00 in the shop: closed until tomorrow 09:00 shop time.
  expect(render([place], {}, '2019-06-04T09:00')).toEqual([['Tokyo shop', 'ClosedOpens tomorrow 09:00']])
})
