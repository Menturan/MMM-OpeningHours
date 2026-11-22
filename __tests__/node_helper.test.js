// MagicMirror provides 'node_helper' at runtime. Stand-in: create() returns the definition.
jest.mock('node_helper', () => ({ create: (definition) => definition }), { virtual: true })
jest.mock('../placesApi.js', () => {
  const actual = jest.requireActual('../placesApi.js')
  return { ...actual, fetchPlaceNew: jest.fn(), fetchPlaceLegacy: jest.fn() }
})

const placesApi = require('../placesApi.js')
const definition = require('../node_helper.js')

const helpers = []
function createHelper () {
  const helper = Object.create(definition)
  helpers.push(helper)
  helper.name = 'MMM-OpeningHours'
  helper.sent = []
  helper.logged = []
  helper.sendSocketNotification = (notification, payload) => helper.sent.push({ notification, payload })
  helper.start()
  return helper
}

// A helper with one registered instance, without starting its timers.
function createInstance (config, identifier = 'module_1') {
  const helper = createHelper()
  const instance = helper.createInstance(identifier, { debug: false, scheduleTime: 86400000, places: [], ...config })
  helper.instances[identifier] = instance
  return { helper, instance }
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

let consoleLog
beforeEach(() => {
  jest.resetAllMocks()
  consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  helpers.splice(0).forEach(h => h.stop())
  consoleLog.mockRestore()
  jest.useRealTimers()
})

test('fetches every place via Places API (New) and applies aliases', async () => {
  placesApi.fetchPlaceNew.mockImplementation(async (id) => ({ place_id: id, name: 'Name ' + id, opening_hours: undefined }))
  const { helper, instance } = createInstance({ places: ['a', ['b', 'Alias B']], googleApiKey: 'KEY', language: 'sv' })
  await helper.getOpeningHours(instance)

  expect(placesApi.fetchPlaceNew).toHaveBeenCalledWith('a', 'KEY', 'sv')
  expect(placesApi.fetchPlaceLegacy).not.toHaveBeenCalled()
  expect(helper.sent).toHaveLength(1)
  expect(helper.sent[0].notification).toBe('PLACES_UPDATE')
  expect(helper.sent[0].payload.identifier).toBe('module_1')
  expect(helper.sent[0].payload.places.map(p => p.alias)).toEqual([undefined, 'Alias B'])
})

test('useLegacyApi switches to the legacy client', async () => {
  placesApi.fetchPlaceLegacy.mockResolvedValue({ place_id: 'a', name: 'A' })
  const { helper, instance } = createInstance({ places: ['a'], useLegacyApi: true })
  await helper.getOpeningHours(instance)
  expect(placesApi.fetchPlaceLegacy).toHaveBeenCalledTimes(1)
  expect(placesApi.fetchPlaceNew).not.toHaveBeenCalled()
})

test('one failing place is kept as a row; the rest still render', async () => {
  placesApi.fetchPlaceNew.mockImplementation(async (id) => {
    if (id === 'bad') throw new Error('NOT_FOUND')
    return { place_id: id, name: 'Good' }
  })
  const { helper, instance } = createInstance({ places: [['bad', 'Bad alias'], 'good'] })
  await helper.getOpeningHours(instance)
  const places = helper.sent[0].payload.places
  expect(helper.sent[0].notification).toBe('PLACES_UPDATE')
  expect(places[0]).toMatchObject({ place_id: 'bad', alias: 'Bad alias', opening_hours: undefined })
  expect(places[1].name).toBe('Good')
})

test('all places failing sends SERVICE_FAILURE instead of hanging on "Loading"', async () => {
  placesApi.fetchPlaceNew.mockRejectedValue(new Error('Places API (New) 403: API not enabled'))
  const { helper, instance } = createInstance({ places: ['a', 'b'] })
  await helper.getOpeningHours(instance)
  expect(helper.sent).toEqual([{
    notification: 'SERVICE_FAILURE',
    payload: { identifier: 'module_1', message: 'Google Places API: Places API (New) 403: API not enabled' }
  }])
})

test('mockData mode reads the Places API (New) mock files without network', async () => {
  const { helper, instance } = createInstance({ mockData: true })
  await helper.getOpeningHours(instance)
  const names = helper.sent[0].payload.places.map(p => p.name)
  expect(names).toContain('Sturecompagniet')
  expect(names).toContain('Closed for lunch')
  expect(placesApi.fetchPlaceNew).not.toHaveBeenCalled()
})

describe('SETUP', () => {
  const config = { places: ['a'], scheduleTime: 86400000, googleApiKey: 'KEY' }

  test('a second SETUP (browser reload) reuses cached data instead of calling the API again', async () => {
    placesApi.fetchPlaceNew.mockResolvedValue({ place_id: 'a', name: 'A' })
    const helper = createHelper()
    helper.socketNotificationReceived('SETUP', { identifier: 'module_1', config })
    await flush()
    helper.socketNotificationReceived('SETUP', { identifier: 'module_1', config: { ...config } })
    expect(placesApi.fetchPlaceNew).toHaveBeenCalledTimes(1)
    expect(helper.sent.map(s => s.notification)).toEqual(['PLACES_UPDATE', 'PLACES_UPDATE'])
  })

  test('a reload after a total failure sends the failure again', async () => {
    placesApi.fetchPlaceNew.mockRejectedValue(new Error('offline'))
    const helper = createHelper()
    helper.socketNotificationReceived('SETUP', { identifier: 'module_1', config })
    await flush()
    helper.socketNotificationReceived('SETUP', { identifier: 'module_1', config })
    expect(helper.sent.map(s => s.notification)).toEqual(['SERVICE_FAILURE', 'SERVICE_FAILURE'])
    expect(placesApi.fetchPlaceNew).toHaveBeenCalledTimes(1)
  })

  test('a changed config fetches again and replaces the old timers', async () => {
    placesApi.fetchPlaceNew.mockImplementation(async (id) => ({ place_id: id, name: id }))
    const helper = createHelper()
    helper.socketNotificationReceived('SETUP', { identifier: 'module_1', config })
    await flush()
    const oldInstance = helper.instances.module_1
    helper.socketNotificationReceived('SETUP', { identifier: 'module_1', config: { ...config, places: ['b'] } })
    await flush()
    expect(oldInstance.updateTimer).toBeUndefined()
    expect(helper.sent[1].payload.places.map(p => p.name)).toEqual(['b'])
  })

  test('two instances keep their own places and notifications', async () => {
    placesApi.fetchPlaceNew.mockImplementation(async (id) => ({ place_id: id, name: 'Name ' + id }))
    const helper = createHelper()
    helper.socketNotificationReceived('SETUP', { identifier: 'module_1', config: { ...config, places: ['a'] } })
    helper.socketNotificationReceived('SETUP', { identifier: 'module_2', config: { ...config, places: ['b'] } })
    await flush()
    const byId = Object.fromEntries(helper.sent.map(s => [s.payload.identifier, s.payload.places.map(p => p.name)]))
    expect(byId).toEqual({ module_1: ['Name a'], module_2: ['Name b'] })
  })

  test('debug logging never prints the API key', () => {
    placesApi.fetchPlaceNew.mockResolvedValue({ place_id: 'a', name: 'A' })
    const helper = createHelper()
    helper.socketNotificationReceived('SETUP', { identifier: 'module_1', config: { ...config, googleApiKey: 'SECRET-KEY', debug: true } })
    const output = JSON.stringify(consoleLog.mock.calls)
    expect(output).toContain('***')
    expect(output).not.toContain('SECRET-KEY')
  })
})

describe('after a failed fetch', () => {
  test('a failing place keeps its last known hours', async () => {
    const hours = { periods: [{ open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } }] }
    placesApi.fetchPlaceNew.mockImplementation(async (id) => ({ place_id: id, name: 'Name ' + id, opening_hours: hours }))
    const { helper, instance } = createInstance({ places: [['a', 'Alias A'], 'b'] })
    await helper.getOpeningHours(instance)

    placesApi.fetchPlaceNew.mockImplementation(async (id) => {
      if (id === 'a') throw new Error('timeout')
      return { place_id: id, name: 'Name ' + id, opening_hours: hours }
    })
    await helper.getOpeningHours(instance)

    const places = helper.sent[1].payload.places
    expect(helper.sent[1].notification).toBe('PLACES_UPDATE')
    expect(places[0]).toMatchObject({ place_id: 'a', name: 'Name a', alias: 'Alias A', opening_hours: hours })
    expect(places[0].error).toBeUndefined()
  })

  test('all places failing keeps the last known data instead of sending SERVICE_FAILURE', async () => {
    placesApi.fetchPlaceNew.mockResolvedValue({ place_id: 'a', name: 'A' })
    const { helper, instance } = createInstance({ places: ['a'] })
    await helper.getOpeningHours(instance)
    placesApi.fetchPlaceNew.mockRejectedValue(new Error('offline'))
    await helper.getOpeningHours(instance)
    expect(helper.sent.map(s => s.notification)).toEqual(['PLACES_UPDATE', 'PLACES_UPDATE'])
    expect(helper.sent[1].payload.places[0].name).toBe('A')
  })

  test('retries after 1, 5 and 30 minutes, then every 30 minutes, and stops once a fetch succeeds', async () => {
    jest.useFakeTimers()
    placesApi.fetchPlaceNew.mockRejectedValue(new Error('offline'))
    const { helper, instance } = createInstance({ places: ['a'] })
    await helper.getOpeningHours(instance)

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
    expect(instance.retryTimer).toBeUndefined()
    expect(instance.retryCount).toBe(0)
    jest.advanceTimersByTime(60 * 60 * 1000)
    await flush()
    expect(placesApi.fetchPlaceNew).toHaveBeenCalledTimes(6)
  })

  test('no retry is scheduled when every place succeeds', async () => {
    placesApi.fetchPlaceNew.mockResolvedValue({ place_id: 'a', name: 'A' })
    const { helper, instance } = createInstance({ places: ['a'] })
    await helper.getOpeningHours(instance)
    expect(instance.retryTimer).toBeUndefined()
  })

  test('a result that arrives after the config changed is dropped', async () => {
    let resolveFetch
    placesApi.fetchPlaceNew.mockImplementation(() => new Promise(resolve => { resolveFetch = resolve }))
    const { helper, instance } = createInstance({ places: ['a'] })
    const pending = helper.getOpeningHours(instance)
    helper.instances.module_1 = helper.createInstance('module_1', instance.config)
    resolveFetch({ place_id: 'a', name: 'A' })
    await pending
    expect(helper.sent).toEqual([])
  })
})
