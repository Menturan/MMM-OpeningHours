// MagicMirror provides 'node_helper' at runtime. Stand-in: create() returns the definition.
jest.mock('node_helper', () => ({ create: (definition) => definition }), { virtual: true })
jest.mock('../placesApi.js', () => {
  const actual = jest.requireActual('../placesApi.js')
  return { ...actual, fetchPlaceNew: jest.fn(), fetchPlaceLegacy: jest.fn() }
})

const placesApi = require('../placesApi.js')
const definition = require('../node_helper.js')

function createHelper (config) {
  const helper = Object.create(definition)
  helper.name = 'MMM-OpeningHours'
  helper.sent = []
  helper.sendSocketNotification = (notification, payload) => helper.sent.push({ notification, payload })
  helper.log = () => {}
  helper.start()
  helper.config = { debug: false, scheduleTime: 86400000, places: [], ...config }
  return helper
}

beforeEach(() => jest.resetAllMocks())

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
