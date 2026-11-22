const NodeHelper = require('node_helper')
const fs = require('fs')
const path = require('path')
const util = require('./backendUtil')
const placesApi = require('./placesApi')

module.exports = NodeHelper.create({

  start: function () {
    this.log('Starting helper: ', this.name)
    this.config = { debug: false }
    this.places = undefined
    this.updateTimer = undefined
  },

  scheduleUpdate: function () {
    clearInterval(this.updateTimer)
    this.updateTimer = setInterval(() => this.getOpeningHours(), this.config.scheduleTime)
  },

  readMockPlaces: function () {
    // Mock files hold recorded API responses: legacy ones in mock_data/, Places API (New) ones in mock_data/places_new/.
    const dir = this.config.useLegacyApi
      ? path.join(__dirname, 'mock_data')
      : path.join(__dirname, 'mock_data', 'places_new')
    return fs.readdirSync(dir)
      .filter(file => file.endsWith('.json'))
      .sort()
      .map(file => {
        const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
        return this.config.useLegacyApi
          ? placesApi.normalizePlaceLegacy(json.result)
          : placesApi.normalizePlaceNew(json)
      })
  },

  fetchPlace: function (placeId) {
    const fetchPlace = this.config.useLegacyApi ? placesApi.fetchPlaceLegacy : placesApi.fetchPlaceNew
    return fetchPlace(placeId, this.config.googleApiKey, this.config.language)
  },

  getOpeningHours: async function () {
    let result
    if (this.config.mockData) {
      this.log('Using mock data.')
      result = this.readMockPlaces()
    } else {
      this.log('Fetching opening hours from Google Places API ' + (this.config.useLegacyApi ? '(Legacy)' : '(New)'))
      const placeIds = this.config.places.map(util.getPlaceId)
      const settled = await Promise.allSettled(placeIds.map(id => this.fetchPlace(id)))
      result = settled.map((outcome, index) => {
        if (outcome.status === 'fulfilled') return outcome.value
        this.log('Error fetching place ' + placeIds[index] + ': ', outcome.reason && outcome.reason.message)
        // Keep the row so the user can see which place failed. The frontend shows it as N/A.
        return { place_id: placeIds[index], name: placeIds[index], opening_hours: undefined, error: true }
      })

      if (result.length > 0 && result.every(p => p.error)) {
        const reason = settled[0].reason
        this.sendSocketNotification('SERVICE_FAILURE', 'Google Places API: ' + (reason && reason.message))
        return
      }
      util.replacePlaceNamesWithUsersOwnAlias(result, this.config.places)
    }

    this.places = result
    this.debugLog('Sending to frontend - ', JSON.stringify(this.places))
    this.sendSocketNotification('PLACES_UPDATE', this.places)
  },

  // --------------------------------------- Handle notifications
  socketNotificationReceived: function (notification, payload) {
    if (notification !== 'SETUP') return
    this.config = payload
    this.debugLog('Config - ', this.config)

    // A browser reload sends SETUP again. Reuse cached data and keep the timer
    // already running, so a reload does not trigger extra billed API calls.
    if (this.places !== undefined && this.updateTimer !== undefined) {
      this.sendSocketNotification('PLACES_UPDATE', this.places)
      return
    }
    if (!this.config.mockData) {
      this.scheduleUpdate()
    }
    this.getOpeningHours().catch(error => {
      this.log('Unexpected error: ', error)
      this.sendSocketNotification('SERVICE_FAILURE', String(error && error.message))
    })
  },

  log: function (msg, object) {
    console.log('[' + (new Date(Date.now())).toLocaleTimeString() + '] - ' + this.name + ' : ' + msg, object === undefined ? '' : object)
  },

  debugLog: function (msg, object) {
    if (this.config && this.config.debug) {
      console.log('[' + (new Date(Date.now())).toLocaleTimeString() + '] - DEBUG - ' + this.name + ' : ' + msg, object === undefined ? '' : object)
    }
  }

})
