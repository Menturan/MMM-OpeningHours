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

function render (places, configOverrides = {}, now = '2019-06-04T10:00') {
  jest.useFakeTimers('modern')
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
  module.socketNotificationReceived('PLACES_UPDATE', [newPlace('normal.json')])
  module.socketNotificationReceived('SERVICE_FAILURE', 'Google Places API: offline')
  expect(module.failure).toBeUndefined()
  expect(module.placesOpeningHours).toHaveLength(1)
})

test('SERVICE_FAILURE without earlier data shows the error', () => {
  const module = Object.create(definition)
  module.config = { ...definition.defaults }
  module.updateDom = () => {}
  module.socketNotificationReceived('SERVICE_FAILURE', 'Google Places API: offline')
  expect(module.failure).toBe('Google Places API: offline')
})

test('every translation file has the same keys as English', () => {
  const en = Object.keys(require('../translations/en.json')).sort()
  Object.keys(definition.getTranslations()).forEach(lang => {
    expect([lang, Object.keys(require('../translations/' + lang + '.json')).sort()]).toEqual([lang, en])
  })
})
