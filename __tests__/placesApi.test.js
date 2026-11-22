const placesApi = require('../placesApi.js')
const { getPlaceFromFile } = require('../testUtil.js')

const newMock = (file) => getPlaceFromFile('mock_data/places_new/' + file).json
const legacyMock = (file) => getPlaceFromFile('mock_data/' + file).json

// Tiny stand-in for fetch(). Records the calls, never touches the network.
function fakeFetch (status, body) {
  const calls = []
  const impl = async (url, options) => {
    calls.push({ url, options })
    return { ok: status >= 200 && status < 300, status, statusText: 'status ' + status, json: async () => body }
  }
  impl.calls = calls
  return impl
}

describe('normalizePlaceNew', () => {
  test('maps id, displayName and periods to the internal shape', () => {
    const place = placesApi.normalizePlaceNew(newMock('open_some_days.json'))
    expect(place.place_id).toBe('ChIJs4cQo1ydX0YRkoCF1aFt_YA')
    expect(place.name).toBe('Sturecompagniet')
    expect(place.opening_hours.periods[0]).toEqual({ open: { day: 4, time: '2200' }, close: { day: 5, time: '0300' } })
  })

  test('gives the same periods as the matching legacy mock', () => {
    for (const file of ['normal.json', 'closed_mon_sun.json', 'open_eve_til_night.json', 'open_some_days.json', '24hour.json']) {
      const fromNew = placesApi.normalizePlaceNew(newMock(file)).opening_hours.periods
      const fromLegacy = placesApi.normalizePlaceLegacy(legacyMock(file).result).opening_hours.periods
      expect(fromNew).toEqual(fromLegacy)
    }
  })

  test('prefers currentOpeningHours (special hours) and keeps period dates', () => {
    const place = placesApi.normalizePlaceNew(newMock('holiday_closed.json'))
    expect(place.opening_hours.periods).toHaveLength(3)
    expect(place.opening_hours.periods[0].open).toEqual({ day: 1, time: '0900', date: '2026-12-21' })
  })

  test('falls back to regularOpeningHours when currentOpeningHours is missing', () => {
    const json = newMock('holiday_closed.json')
    delete json.currentOpeningHours
    expect(placesApi.normalizePlaceNew(json).opening_hours.periods).toHaveLength(5)
  })

  test('uses regularOpeningHours for 24/7 places even when currentOpeningHours exists', () => {
    const json = newMock('24hour.json')
    json.currentOpeningHours = {
      periods: [{ open: { day: 1, hour: 0, minute: 0, date: { year: 2026, month: 1, day: 5 } }, close: { day: 1, hour: 23, minute: 59, truncated: true, date: { year: 2026, month: 1, day: 5 } } }]
    }
    expect(placesApi.normalizePlaceNew(json).opening_hours.periods).toEqual([{ open: { day: 0, time: '0000' }, close: undefined }])
  })

  test('no opening hours gives opening_hours undefined', () => {
    expect(placesApi.normalizePlaceNew(newMock('no_opening_hours.json')).opening_hours).toBeUndefined()
    expect(placesApi.normalizePlaceLegacy(legacyMock('no_opening_hours.json').result).opening_hours).toBeUndefined()
  })
})

describe('fetchPlaceNew', () => {
  test('calls Place Details (New) with key and field mask headers', async () => {
    const fetchImpl = fakeFetch(200, newMock('normal.json'))
    const place = await placesApi.fetchPlaceNew('normal-id', 'KEY', 'sv', fetchImpl)
    expect(place.name).toBe('Normal store')
    expect(fetchImpl.calls).toHaveLength(1)
    const { url, options } = fetchImpl.calls[0]
    expect(url).toBe('https://places.googleapis.com/v1/places/normal-id?languageCode=sv')
    expect(options.headers['X-Goog-Api-Key']).toBe('KEY')
    expect(options.headers['X-Goog-FieldMask']).toBe('id,displayName,utcOffsetMinutes,currentOpeningHours,regularOpeningHours')
    expect(url).not.toContain('KEY')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  test('maps utcOffsetMinutes', async () => {
    const fetchImpl = fakeFetch(200, { ...newMock('normal.json'), utcOffsetMinutes: 120 })
    expect((await placesApi.fetchPlaceNew('id', 'KEY', 'en', fetchImpl)).utc_offset_minutes).toBe(120)
    expect(placesApi.normalizePlaceNew(newMock('normal.json')).utc_offset_minutes).toBeUndefined()
  })

  test('throws with the Google error message on HTTP errors', async () => {
    const fetchImpl = fakeFetch(403, { error: { code: 403, message: 'Places API (New) has not been used in project 123', status: 'PERMISSION_DENIED' } })
    await expect(placesApi.fetchPlaceNew('x', 'KEY', 'en', fetchImpl))
      .rejects.toThrow('Places API (New) 403: Places API (New) has not been used in project 123')
  })
})

describe('fetchPlaceLegacy', () => {
  test('calls Place Details (Legacy) and normalizes the result', async () => {
    const fetchImpl = fakeFetch(200, legacyMock('24hour.json'))
    const place = await placesApi.fetchPlaceLegacy('uber-id', 'KEY', 'en', fetchImpl)
    expect(place.place_id).toBe('uber-id')
    const url = new URL(fetchImpl.calls[0].url)
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/place/details/json')
    expect(url.searchParams.get('place_id')).toBe('uber-id')
    expect(url.searchParams.get('fields')).toBe('name,opening_hours,place_id,utc_offset')
    expect(fetchImpl.calls[0].options.signal).toBeInstanceOf(AbortSignal)
  })

  test('maps utc_offset (and utc_offset_minutes if present)', () => {
    expect(placesApi.normalizePlaceLegacy({ place_id: 'a', name: 'A', utc_offset: 60 }).utc_offset_minutes).toBe(60)
    expect(placesApi.normalizePlaceLegacy({ place_id: 'a', name: 'A', utc_offset_minutes: -300 }).utc_offset_minutes).toBe(-300)
  })

  test('throws on a non-OK status in the body', async () => {
    const fetchImpl = fakeFetch(200, { status: 'REQUEST_DENIED', error_message: 'This API is not activated' })
    await expect(placesApi.fetchPlaceLegacy('x', 'KEY', 'en', fetchImpl))
      .rejects.toThrow('Places API (Legacy) REQUEST_DENIED: This API is not activated')
  })
})
