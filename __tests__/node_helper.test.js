// MagicMirror provides 'node_helper' at runtime. Stand-in: create() returns the definition.
jest.mock('node_helper', () => ({ create: (definition) => definition }), { virtual: true })
jest.mock('../placesApi.js', () => {
  const actual = jest.requireActual('../placesApi.js')
  return { ...actual, fetchPlaceNew: jest.fn(), fetchPlaceLegacy: jest.fn() }
})

const placesApi = require('../placesApi.js')
const definition = require('../node_helper.js')

const helpers = []
function createHelper (config) {
  const helper = Object.create(definition)
  helpers.push(helper)
  helper.name = 'MMM-OpeningHours'
  helper.sent = []
  helper.sendSocketNotification = (notification, payload) => helper.sent.push({ notification, payload })
  helper.log = () => {}
  helper.start()
  helper.config = { debug: false, scheduleTime: 86400000, places: [], ...config }
  return helper
}

beforeEach(() => jest.resetAllMocks())
afterEach(() => {
  helpers.splice(0).forEach(h => { clearTimeout(h.retryTimer); clearInterval(h.updateTimer) })
})

test('fetches every place via Places API (New) and applies aliases', async () => {
  placesApi.fetchPlaceNew.mockImplementation(async (id) => ({ place_id: id, name: 'Name ' + id, opening_hours: undefined }))
  const helper = createHelper({ places: ['a', ['b', 'Alias B']], googleApiKey: 'KEY', language: 'sv' })
  await helper.getOpeningHours()

  expect(placesApi.fetchPlaceNew).toHaveBeenCalledWith('a', 'KEY', 'sv')
  expect(placesApi.fetchPlaceLegacy).not.toHaveBeenCalled()
  expect(helper.sent).toHaveLength(1)
  expect(helper.sent[0].notification).toBe('PLACES_UPDATE')
  expect(helper.sent[0].payload.map(p => p.alias)).toEqual([undefined, 'Alias B'])
})

test('useLegacyApi switches to the legacy client', async () => {
  placesApi.fetchPlaceLegacy.mockResolvedValue({ place_id: 'a', name: 'A' })
  const helper = createHelper({ places: ['a'], useLegacyApi: true })
  await helper.getOpeningHours()
  expect(placesApi.fetchPlaceLegacy).toHaveBeenCalledTimes(1)
  expect(placesApi.fetchPlaceNew).not.toHaveBeenCalled()
})

test('one failing place is kept as a row; the rest still render', async () => {
  placesApi.fetchPlaceNew.mockImplementation(async (id) => {
    if (id === 'bad') throw new Error('NOT_FOUND')
    return { place_id: id, name: 'Good' }
  })
  const helper = createHelper({ places: [['bad', 'Bad alias'], 'good'] })
  await helper.getOpeningHours()
  expect(helper.sent[0].notification).toBe('PLACES_UPDATE')
  expect(helper.sent[0].payload[0]).toMatchObject({ place_id: 'bad', alias: 'Bad alias', opening_hours: undefined })
  expect(helper.sent[0].payload[1].name).toBe('Good')
})

test('all places failing sends SERVICE_FAILURE instead of hanging on "Loading"', async () => {
  placesApi.fetchPlaceNew.mockRejectedValue(new Error('Places API (New) 403: API not enabled'))
  const helper = createHelper({ places: ['a', 'b'] })
  await helper.getOpeningHours()
  expect(helper.sent).toEqual([{ notification: 'SERVICE_FAILURE', payload: 'Google Places API: Places API (New) 403: API not enabled' }])
})

test('mockData mode reads the Places API (New) mock files without network', async () => {
  const helper = createHelper({ mockData: true })
  await helper.getOpeningHours()
  const names = helper.sent[0].payload.map(p => p.name)
  expect(names).toContain('Sturecompagniet')
  expect(names).toContain('Closed for lunch')
  expect(placesApi.fetchPlaceNew).not.toHaveBeenCalled()
})

test('a second SETUP (browser reload) reuses cached data instead of calling the API again', async () => {
  placesApi.fetchPlaceNew.mockResolvedValue({ place_id: 'a', name: 'A' })
  const helper = createHelper()
  const config = { places: ['a'], scheduleTime: 86400000, googleApiKey: 'KEY' }
  try {
    helper.socketNotificationReceived('SETUP', config)
    await new Promise(resolve => setImmediate(resolve)) // let the first fetch finish
    helper.socketNotificationReceived('SETUP', config)
    expect(placesApi.fetchPlaceNew).toHaveBeenCalledTimes(1)
    expect(helper.sent.map(s => s.notification)).toEqual(['PLACES_UPDATE', 'PLACES_UPDATE'])
  } finally {
    clearInterval(helper.updateTimer)
  }
})

describe('after a failed fetch', () => {
  afterEach(() => jest.useRealTimers())

  test('a failing place keeps its last known hours', async () => {
    const hours = { periods: [{ open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } }] }
    placesApi.fetchPlaceNew.mockImplementation(async (id) => ({ place_id: id, name: 'Name ' + id, opening_hours: hours }))
    const helper = createHelper({ places: [['a', 'Alias A'], 'b'] })
    await helper.getOpeningHours()

    placesApi.fetchPlaceNew.mockImplementation(async (id) => {
      if (id === 'a') throw new Error('timeout')
      return { place_id: id, name: 'Name ' + id, opening_hours: hours }
    })
    await helper.getOpeningHours()

    const payload = helper.sent[1].payload
    expect(helper.sent[1].notification).toBe('PLACES_UPDATE')
    expect(payload[0]).toMatchObject({ place_id: 'a', name: 'Name a', alias: 'Alias A', opening_hours: hours })
    expect(payload[0].error).toBeUndefined()
  })

  test('all places failing keeps the last known data instead of sending SERVICE_FAILURE', async () => {
    placesApi.fetchPlaceNew.mockResolvedValue({ place_id: 'a', name: 'A' })
    const helper = createHelper({ places: ['a'] })
    await helper.getOpeningHours()
    placesApi.fetchPlaceNew.mockRejectedValue(new Error('offline'))
    await helper.getOpeningHours()
    expect(helper.sent.map(s => s.notification)).toEqual(['PLACES_UPDATE', 'PLACES_UPDATE'])
    expect(helper.sent[1].payload[0].name).toBe('A')
  })

  test('retries after 1, 5 and 30 minutes, then every 30 minutes, and stops once a fetch succeeds', async () => {
    jest.useFakeTimers('modern')
    placesApi.fetchPlaceNew.mockRejectedValue(new Error('offline'))
    const helper = createHelper({ places: ['a'] })
    await helper.getOpeningHours()

    const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
    const expectRetryAfter = async (minutes, calls) => {
      jest.advanceTimersByTime(minutes * 60 * 1000 - 1)
      await flush()
      expect(placesApi.fetchPlaceNew).toHaveBeenCalledTimes(calls - 1)
      jest.advanceTimersByTime(1)
      await flush()
      expect(placesApi.fetchPlaceNew).toHaveBeenCalledTimes(calls)
    }
    await expectRetryAfter(1, 2)
    await expectRetryAfter(5, 3)
    await expectRetryAfter(30, 4)
    await expectRetryAfter(30, 5)

    placesApi.fetchPlaceNew.mockResolvedValue({ place_id: 'a', name: 'A' })
    await expectRetryAfter(30, 6)
    expect(helper.retryTimer).toBeUndefined()
    expect(helper.retryCount).toBe(0)
    jest.advanceTimersByTime(60 * 60 * 1000)
    await flush()
    expect(placesApi.fetchPlaceNew).toHaveBeenCalledTimes(6)
  })

  test('no retry is scheduled when every place succeeds', async () => {
    placesApi.fetchPlaceNew.mockResolvedValue({ place_id: 'a', name: 'A' })
    const helper = createHelper({ places: ['a'] })
    await helper.getOpeningHours()
    expect(helper.retryTimer).toBeUndefined()
  })
})
