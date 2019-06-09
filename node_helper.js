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
  
  mockGooglePlacesApi (self, index) {
    self.log('Using mock data.')
    return new Promise(function (resolve, reject) {
      let file = ''
      switch (index) {
        case 0:
          file = './modules/MMM-OpeningHours/mock_data/normal.json'
          break;
        case 1:
          file = './modules/MMM-OpeningHours/mock_data/24hour.json'
          break;
        case 2:
          file = './modules/MMM-OpeningHours/mock_data/closed_mon_sun.json'
          break;
        case 3:
          file = './modules/MMM-OpeningHours/mock_data/open_eve_til_night.json'
          break;
        case 4:
          file = './modules/MMM-OpeningHours/mock_data/no_opening_hours.json'
          break;
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
          fields: ['name', 'opening_hours', 'place_id'],
        }).asPromise()
      }
      self.debugLog('googlePromise - ', googlePromise)
      return googlePromise.then(function (response) {
        self.debugLog('Response - ', JSON.stringify(response))
        // self.debugLog('Response.json.result - ', response.json.result)
        return response.json.result
      }).catch(function (error) {
        self.log(': Error: ', error)
        // self.sendSocketNotification('SERVICE_FAILURE', error)
      })
    })

    Promise.all(opening_hours_promises).then(function (result) {
      this.places = result
      self.debugLog('Sending to frontend - ', JSON.stringify(this.places))
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
