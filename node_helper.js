var moment = require('moment')
const NodeHelper = require('node_helper')
var google = require('@google/maps')
var fs = require('fs')

var googleClient = undefined

module.exports = NodeHelper.create({

  start: function () {
    var self = this
    self.log('Starting helper: ', this.name)
    this.started = false
  },

  scheduleUpdate: function () {
    var self = this
    this.updatetimer = setInterval(function () {
      self.getOpeningHours()
    }, this.config.scheduleTime) // 1min
  },

  /*
  activateRetryScheduele: function () {
    var self = this
    if (this.retrytimer === undefined) {
      self.log('Activating retry schedule.')
      this.retrytimer = setInterval(function () {
        self.getOpeningHours()
      }, 60000 * 5) // 5min
    }
  },

  deactivateRetryScheduele: function () {
    var self = this
    if (this.retrytimer !== undefined) {
      self.log('Deactivating retry schedule.')
      clearInterval(this.retrytimer)
    }
  },
  */
  mockGooglePlacesApi (self, index) {
    self.log('Using mock data.')
    return new Promise(function (resolve, reject) {
      let file = ''
      if (index === 0) {
        file = './modules/MMM-OpeningHours/mock_data/burger_king.json'
      } else {
        file = './modules/MMM-OpeningHours/mock_data/macDonalds.json'
      }
      fs.readFile(file, 'utf8', function (err, data) {
        if (err != null) {
          reject(err)
        }
        resolve({ json: JSON.parse(data) })
      })
    })
  },

  getOpeningHours: function () {
    var self = this
    self.log('Fetching opening hours')
    let opening_hours_promises = this.config.places.map((place, index) => {
      let googlePromise
      if (this.config.mockData) {
        googlePromise = self.mockGooglePlacesApi(self, index)
      } else {
        self.log('Using Google Places API.')
        googlePromise = googleClient.place({
          placeid: place,
          fields: ['name', 'opening_hours'],
        }).asPromise()
      }
      self.debugLog('googlePromise - ', googlePromise)
      return googlePromise.then(function (response) {
        self.debugLog('Response - ', response)
        self.debugLog('Response.json.result - ', response.json.result)
        return response.json.result
      }).catch(function (error) {
        self.log(': Error: ', error)
        // self.sendSocketNotification('SERVICE_FAILURE', error)
      })
    })

    Promise.all(opening_hours_promises).then(function (result) {
      self.debugLog('Sending to frontend - ', result)
      this.places = result
      self.sendSocketNotification('PLACES_UPDATE', result)
    })

  },

// --------------------------------------- Handle notifications
  socketNotificationReceived: function (notification, payload) {
    var self = this
    this.config = payload
    self.debugLog('Notification - ' + notification)
    self.debugLog('Started - ' + this.started)
    self.debugLog('Config - ', this.config)
    if (notification === 'SETUP') {
      this.config = payload
      if (!this.config.mockData) {
        if (this.started === false) {
          moment.locale(this.config.language)
          googleClient = google.createClient({
            key: this.config.googleApiKey,
            Promise: Promise,
            language: this.config.language
          })
          self.scheduleUpdate()
        }
      }
      this.started = true
      self.getOpeningHours()
    } else {
      self.sendSocketNotification('PLACES_UPDATE', this.places)
    }

  }
  ,
  log: function (msg, object) {
    console.log('[' + (new Date(Date.now())).toLocaleTimeString() + '] - ' + this.name + ' : ' + msg, object === undefined ? '' : object)
  }
  ,
  debugLog: function (msg, object) {
    if (this.config.debug) {
      console.log('[' + (new Date(Date.now())).toLocaleTimeString() + '] - DEBUG - ' + this.name + ' : ' + msg, object === undefined ? '' : object)
    }
  }

})
