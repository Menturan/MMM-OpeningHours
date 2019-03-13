var moment = require('moment')
const NodeHelper = require('node_helper')

var google = require('@google/maps')

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

  getOpeningHours: function () {
    var self = this
    self.log('Fetching opening hours')
    googleClient.place({
      placeid: this.config.stores[0],
      language: this.config.language
      // fields: ['name', 'opening_hours'],
    }).asPromise()
      .then(function (response) {
        self.sendSocketNotification('PLACES_UPDATE', response.json.result)
      }).catch(function (error) {
      self.log(': Error: ', error)
      self.sendSocketNotification('SERVICE_FAILURE', error)
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
      if (this.started === false) {
        moment.locale(this.config.language)
        googleClient = google.createClient({
          key: this.config.googleApiKey,
          Promise: Promise
        })
        this.started = true
        self.scheduleUpdate()
      }
      self.getOpeningHours()
    } else {
      self.sendSocketNotification('PLACES_UPDATE', this.names)
    }

  },
  log: function (msg, object) {
    console.log('[' + (new Date(Date.now())).toLocaleTimeString() + '] - ' + this.name + ' : ' + msg, object === undefined ? '' : object)
  },
  debugLog: function (msg, object) {
    if (this.config.debug) {
      console.log('[' + (new Date(Date.now())).toLocaleTimeString() + '] - DEBUG - ' + this.name + ' : ' + msg, object === undefined ? '' : object)
    }
  }

})
