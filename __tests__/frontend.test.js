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
