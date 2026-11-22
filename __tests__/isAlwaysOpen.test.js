const { isAlwaysOpen, hasPeriods } = require('../Parsers.js')
const { normalizePlaceLegacy, normalizePlaceNew } = require('../placesApi.js')
const { getPlaceFromFile } = require('../testUtil.js')

const legacy = (file) => normalizePlaceLegacy(getPlaceFromFile('mock_data/' + file).json.result)
const places = (file) => normalizePlaceNew(getPlaceFromFile('mock_data/places_new/' + file).json)

describe('Correctly parses place that are open 24/7', () => {
  test('should return true for always open (legacy response)', () => {
    expect(isAlwaysOpen(legacy('24hour.json'))).toBe(true)
  })
  test('should return true for always open (Places API (New) response)', () => {
    expect(isAlwaysOpen(places('24hour.json'))).toBe(true)
  })
  test('should return false for a normal store', () => {
    expect(isAlwaysOpen(places('normal.json'))).toBe(false)
  })
  test('does not throw for a place without opening hours', () => {
    expect(isAlwaysOpen(places('no_opening_hours.json'))).toBe(false)
    expect(isAlwaysOpen(legacy('no_opening_hours.json'))).toBe(false)
    expect(hasPeriods(legacy('no_opening_hours.json'))).toBe(false)
    expect(isAlwaysOpen(undefined)).toBe(false)
  })
})
