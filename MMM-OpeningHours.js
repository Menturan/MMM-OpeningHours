/*
 * Notifications:
 *      PLACES_UPDATE: Recived when places opening hours gets fetch/refetch.
 *      SERVICE_FAILURE: Received when the service access failed.
 */
Module.register('MMM-OpeningHours', {
  // Module defaults
  defaults: {
    googleApiKey: undefined,
    stores: [],
    scheduleTime: 60000 * 60 * 24,
    timeFormat: config.timeFormat,
    language: config.language,
    styling: {
      showHeader: true,
      showTimeUntil: true
    },
    debug: true
  },

  getTranslations () {
    return {
      en: 'translations/en.json',
      sv: 'translations/sv.json',
    }
  },
  // Required scripts
  getScripts: function () {
    return ['moment.js']
  },

  getStyles: function () {
    return []
  },

  // Start the module
  start: function () {
    Log.log('Starting module: ' + this.name)
    this.debugLog("Config: ", this.config)
    this.loaded = false
    moment.locale(this.config.language)
    if (this.config.language === undefined || this.config.language === '') {
      this.config.language = 'en'
    }
    if (this.config.googleApiKey === undefined) {
      this.failure = this.translate('NO_API_KEY_PROVIDED')
      this.loaded = true
    } else if (this.config.stores.length === 0) {
      this.failure = this.translate('NO_STORES_PROVIDED')
      this.loaded = true
    } else {
      this.sendSocketNotification('SETUP', this.config) // Send config to helper and initiate an update
    }
  },

  getDom: function () {
    var wrapper = document.createElement('div')
    wrapper.style = 'width: -moz-fit-content;'
    if (this.config.styling.showHeader) {
      var headerHtml = document.createElement('header')
      headerHtml.innerHTML = this.translate('HEADER')
      headerHtml.style = 'margin-bottom: 5px;text-align: center;'
      wrapper.appendChild(headerHtml)
    }
    let container = document.createElement('div')

    if (!this.loaded) {
      container.innerHTML = this.translate('LOADING_MODULE')
      container.className = 'dimmed light small'
    } else if (this.failure !== undefined) {
      container.innerHTML = this.failure
      container.className = 'dimmed light small'
    } else {
      places.forEach(name => {
        var p = document.createElement('p')
        p.style = 'margin-top: 0px;margin-bottom: 0px;'
        p.innerHTML = name
        container.appendChild(p)
      })
      // container.innerHTML = places[0] + "</br>" + places[1];
      container.className = 'bright small'
    }
    container.style = 'text-align: center;'
    wrapper.appendChild(container)
    return wrapper
  },

  socketNotificationReceived: function (notification, payload) {
    this.debugLog('Notification - ', notification)
    if (notification === 'PLACES_UPDATE') {
      this.loaded = true
      this.failure = undefined
      places = payload
      this.debugLog('Places: ', places)
      this.updateDom()
    }
    if (notification === 'SERVICE_FAILURE') {
      this.failure = payload
      this.loaded = true
      Log.log('Service failure: ', this.failure)
      this.updateDom()
    }
  },

  debugLog: function (msg, object) {
    if (this.config.debug) {
      Log.log(
        '[' +
        new Date(Date.now()).toLocaleTimeString() +
        '] - DEBUG - ' +
        this.name +
        ' - ' +
        new Error().lineNumber +
        ' - : ' +
        msg, object
      )
    }
  }
})
