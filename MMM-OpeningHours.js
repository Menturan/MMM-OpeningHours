/*
 * Notifications:
 *      PLACES_UPDATE: Received when places opening hours gets fetch/refetch.
 *      SERVICE_FAILURE: Received when the service access failed.
 */
Module.register('MMM-OpeningHours', {
  // Module defaults
  defaults: {
    googleApiKey: undefined,
    places: [],
    scheduleTime: 60000 * 60 * 24,
    timeFormat: config.timeFormat,
    language: config.language,
    styling: {
      showTimeUntil: true,
      textAlign: 'center',
      size: 'small'
    },
    debug: true,
    mockData: false
  },

  getTranslations () {
    switch (this.config.language) {
      case 'en':
        return { en: 'translations/en.json' }
      case 'sv':
        return { sv: 'translations/sv.json' }
      default:
        return { en: 'translations/en.json' }
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
    this.config.styling = { ...this.defaults.styling, ...this.config.styling }
    this.debugLog('Default config: ', this.defaults)
    this.debugLog('Config: ', this.config)
    this.loaded = false
    moment.locale(config.language)
    if (this.config.googleApiKey === undefined || this.config.googleApiKey === '') {
      this.failure = this.translate('NO_API_KEY_PROVIDED')
      this.loaded = true
    } else if (this.config.places.length === 0) {
      this.failure = this.translate('NO_PLACES_PROVIDED')
      this.loaded = true
    } else {
      this.sendSocketNotification('SETUP', this.config) // Send config to helper and initiate an update
    }

    // Schedule update interval for ui.
    var self = this
    setInterval(function () {
      self.updateDom()
    }, 1000 * 60) // 1min
  },

  getHeader: function () {
    return this.data.header;
  },

  getDom: function () {
    var wrapper = document.createElement('div')
    wrapper.style = 'width: -moz-fit-content;'
    let container = document.createElement('div')

    if (!this.loaded) {
      container.innerHTML = this.translate('LOADING_MODULE')
      container.className = 'dimmed light small'
    } else if (this.failure !== undefined) {
      container.innerHTML = this.failure
      container.className = 'dimmed light small'
    } else {
      let table = document.createElement('table')
      table.className = 'normal'
      this.placesOpeningHours.forEach(place => {
        let row = table.insertRow()
        // Name
        let nameCell = row.insertCell()
        nameCell.innerHTML = place.name
        nameCell.className = 'bright'
        // Opening hours
        let openCell = row.insertCell()
        openCell.style = 'padding-left: 8px;'
        let openCellTable = document.createElement('table')
        const currentTime = this.config.mockData ? moment('20:00', 'HH:mm') : moment()
        this.debugLog('Moment now: ', currentTime.format('HH:mm'))

        // Is yesterdays opening hours still in place. (Open over midnight).
        const openingHoursYesterday = place.opening_hours.periods[moment().weekday() - 1]
        let closingTime = moment(openingHoursYesterday.close.time, 'HHmm').weekday(openingHoursYesterday.close.day)
        let openingTime = moment(openingHoursYesterday.open.time, 'HHmm').weekday(openingHoursYesterday.open.day)
        let placeIsOpen = currentTime.isBetween(openingTime, closingTime)

        if (placeIsOpen === false) {
          let openingHoursToday = place.opening_hours.periods[moment().weekday()]
          closingTime = moment(openingHoursToday.close.time, 'HHmm').weekday(openingHoursToday.close.day)
          openingTime = moment(openingHoursToday.open.time, 'HHmm').weekday(openingHoursToday.open.day)
          placeIsOpen = currentTime.isBetween(openingTime, closingTime)
        }
        let openTextCell = openCellTable.insertRow()
        openTextCell.innerHTML = placeIsOpen ? this.translate('OPEN') : this.translate('CLOSED')
        openTextCell.className = 'xsmall'
        openTextCell.style = placeIsOpen ? 'color: green;' : 'color: red;'
        let openingHoursCell = openCellTable.insertRow()
        openingHoursCell.className = 'xsmall'
        if (this.config.styling.showTimeUntil) {
          if (placeIsOpen) {
            let timeUntilClosing = moment.duration(closingTime.diff(currentTime)).humanize()
            openingHoursCell.innerHTML = this.translate('CLOSES_IN', { 'timeUntilClosing': timeUntilClosing })
          } else {
            let timeUntilOpen = moment.duration(currentTime.diff(openingTime)).humanize()
            openingHoursCell.innerHTML = this.translate('OPENS_IN', { 'timeUntilOpen': timeUntilOpen })

          }
        } else {
          if (placeIsOpen) {
            openingHoursCell.innerHTML = this.translate('CLOSES') + ' ' + closingTime.format('HH:mm')
          } else {
            openingHoursCell.innerHTML = this.translate('OPENS') + ' ' + openingTime.format('HH:mm')
          }
        }

        openCell.appendChild(openCellTable)
      })
      container.appendChild(table)
      container.className = this.config.styling.size
    }
    container.style = 'text-align: ' + this.config.styling.textAlign + ';'
    wrapper.appendChild(container)
    return wrapper
  },

  socketNotificationReceived: function (notification, payload) {
    this.debugLog('Notification - ', notification)
    if (notification === 'PLACES_UPDATE') {
      this.loaded = true
      this.failure = undefined
      this.placesOpeningHours = payload
      this.debugLog('Places opening hours: ', this.placesOpeningHours[0])
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
