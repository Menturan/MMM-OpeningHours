const NodeHelper = require('node_helper')
const fs = require('fs')
const path = require('path')
const util = require('./backendUtil')
const placesApi = require('./placesApi')

// Delays before retrying after a failed fetch. The last one repeats until a fetch succeeds.
const RETRY_DELAYS = [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000]

// Copy of a config that is safe to log.
function redact (config) {
  return config && config.googleApiKey ? { ...config, googleApiKey: '***' } : config
}

/*
 * Every module instance in config.js has its own state here, keyed by the
 * module's identifier, so several instances with different places do not
 * overwrite each other. All notifications carry the identifier; each frontend
 * ignores the ones meant for other instances.
 */
module.exports = NodeHelper.create({

  start: function () {
    this.log('Starting helper: ', this.name)
    this.instances = {}
  },

  createInstance: function (identifier, config) {
    return { identifier, config, places: undefined, failure: undefined, updateTimer: undefined, retryTimer: undefined, retryCount: 0 }
  },

  stopInstance: function (instance) {
    clearInterval(instance.updateTimer)
    clearTimeout(instance.retryTimer)
    instance.updateTimer = undefined
    instance.retryTimer = undefined
  },

  send: function (instance, notification, data) {
    this.sendSocketNotification(notification, { identifier: instance.identifier, ...data })
  },

  scheduleUpdate: function (instance) {
    clearInterval(instance.updateTimer)
    instance.updateTimer = setInterval(() => this.update(instance), instance.config.scheduleTime)
  },

  // Called after each fetch. Any failure schedules a retry with backoff, so a
  // short network outage does not leave the module broken until the next scheduled update.
  scheduleRetry: function (instance, failed) {
    clearTimeout(instance.retryTimer)
    instance.retryTimer = undefined
    if (!failed) {
      instance.retryCount = 0
      return
    }
    const delay = RETRY_DELAYS[Math.min(instance.retryCount, RETRY_DELAYS.length - 1)]
    instance.retryCount++
    this.log('Retrying in ' + Math.round(delay / 60000) + ' min.')
    instance.retryTimer = setTimeout(() => {
      instance.retryTimer = undefined
      this.update(instance)
    }, delay)
  },

  update: function (instance) {
    return this.getOpeningHours(instance).catch(error => {
      this.log('Unexpected error: ', error)
      this.send(instance, 'SERVICE_FAILURE', { message: String(error && error.message) })
    })
  },

  readMockPlaces: function (config) {
    // Mock files hold recorded API responses: legacy ones in mock_data/, Places API (New) ones in mock_data/places_new/.
    const dir = config.useLegacyApi
      ? path.join(__dirname, 'mock_data')
      : path.join(__dirname, 'mock_data', 'places_new')
    return fs.readdirSync(dir)
      .filter(file => file.endsWith('.json'))
      .sort()
      .map(file => {
        const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
        return config.useLegacyApi
          ? placesApi.normalizePlaceLegacy(json.result)
          : placesApi.normalizePlaceNew(json)
      })
  },

  fetchPlace: function (config, placeId) {
    const fetchPlace = config.useLegacyApi ? placesApi.fetchPlaceLegacy : placesApi.fetchPlaceNew
    return fetchPlace(placeId, config.googleApiKey, config.language)
  },

  // The last successfully fetched data for a place, if any.
  cachedPlace: function (instance, placeId) {
    if (!Array.isArray(instance.places)) return undefined
    return instance.places.find(p => p && p.place_id === placeId && !p.error)
  },

  getOpeningHours: async function (instance) {
    const config = instance.config
    let result
    if (config.mockData) {
      this.log('Using mock data.')
      result = this.readMockPlaces(config)
    } else {
      this.log('Fetching opening hours from Google Places API ' + (config.useLegacyApi ? '(Legacy)' : '(New)'))
      const placeIds = config.places.map(util.getPlaceId)
      const settled = await Promise.allSettled(placeIds.map(id => this.fetchPlace(config, id)))
      // The instance was replaced (new config) while this fetch was running. Drop the result.
      if (this.instances[instance.identifier] !== instance) return

      result = settled.map((outcome, index) => {
        if (outcome.status === 'fulfilled') return outcome.value
        this.log('Error fetching place ' + placeIds[index] + ': ', outcome.reason && outcome.reason.message)
        // Keep showing the last known hours for this place, if there are any.
        const cached = this.cachedPlace(instance, placeIds[index])
        if (cached) return cached
        // Otherwise keep the row so the user can see which place failed. The frontend shows it as N/A.
        return { place_id: placeIds[index], name: placeIds[index], opening_hours: undefined, error: true }
      })
      const failed = settled.some(outcome => outcome.status === 'rejected')
      this.scheduleRetry(instance, failed)

      if (result.length > 0 && result.every(p => p.error)) {
        const reason = settled.find(outcome => outcome.status === 'rejected').reason
        instance.failure = 'Google Places API: ' + (reason && reason.message)
        this.send(instance, 'SERVICE_FAILURE', { message: instance.failure })
        return
      }
      util.replacePlaceNamesWithUsersOwnAlias(result, config.places)
    }

    instance.places = result
    instance.failure = undefined
    this.debugLog(config, 'Sending to frontend - ', JSON.stringify(instance.places))
    this.send(instance, 'PLACES_UPDATE', { places: instance.places })
  },

  // --------------------------------------- Handle notifications
  socketNotificationReceived: function (notification, payload) {
    if (notification !== 'SETUP') return
    const { identifier, config } = payload
    this.debugLog(config, 'Config for ' + identifier + ' - ', redact(config))

    // A browser reload sends SETUP again. With an unchanged config, reuse cached
    // data and keep the timer already running, so a reload does not trigger extra billed API calls.
    const existing = this.instances[identifier]
    if (existing && JSON.stringify(existing.config) === JSON.stringify(config)) {
      if (existing.places !== undefined) this.send(existing, 'PLACES_UPDATE', { places: existing.places })
      else if (existing.failure !== undefined) this.send(existing, 'SERVICE_FAILURE', { message: existing.failure })
      return
    }
    if (existing) this.stopInstance(existing)

    const instance = this.createInstance(identifier, config)
    this.instances[identifier] = instance
    if (!config.mockData) {
      this.scheduleUpdate(instance)
    }
    this.update(instance)
  },

  stop: function () {
    Object.values(this.instances).forEach(instance => this.stopInstance(instance))
  },

  log: function (msg, object) {
    console.log('[' + (new Date(Date.now())).toLocaleTimeString() + '] - ' + this.name + ' : ' + msg, object === undefined ? '' : object)
  },

  debugLog: function (config, msg, object) {
    if (config && config.debug) {
      console.log('[' + (new Date(Date.now())).toLocaleTimeString() + '] - DEBUG - ' + this.name + ' : ' + msg, object === undefined ? '' : object)
    }
  }

})
