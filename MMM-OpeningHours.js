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
      showTimeUntil: false,
      textAlign: 'center',
      size: 'small'
    },
    useLegacyApi: false, // true = Places API (Legacy). Only works on Cloud projects that already have it enabled.
    debug: false,
    mockData: false
  },

  getTranslations () {
    // MagicMirror picks the file matching the language and falls back to English.
    return {
      en: 'translations/en.json',
      sv: 'translations/sv.json',
      es: 'translations/es.json',
      fr: 'translations/fr.json'
    }
  },
  // Required scripts
  getScripts: function () {
    return ['moment.js', this.file('Parsers.js'), this.file('OpeningHoursLogic.js')]
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
    moment.locale(this.config.language)
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
    return this.data.header
  },

  getDom: function () {
    var wrapper = document.createElement('div')
    wrapper.style = 'width: -moz-fit-content;'
    let container = document.createElement('div')
    container.style = 'text-align: ' + this.config.styling.textAlign + ';'

    // Loading
    if (!this.loaded) {
      container.innerHTML = this.translate('LOADING_MODULE')
      container.className = 'dimmed light small'
      wrapper.appendChild(container)
      return wrapper
    }

    // Failure
    if (this.failure !== undefined) {
      container.textContent = this.failure
      container.className = 'dimmed light small'
      wrapper.appendChild(container)
      return wrapper
    }

    let table = document.createElement('table')
    table.className = 'normal'
    const timeFormat = this.config.timeFormat === 12 ? 'h:mm A' : 'HH:mm'
    this.placesOpeningHours.forEach(place => {
      this.debugLog('Place: ', place.name + ' (' + place.place_id + ')')
      const row = table.insertRow()
      // Name. textContent, not innerHTML: the name comes from Google or the config.
      const nameCell = row.insertCell()
      nameCell.textContent = place.alias === undefined ? place.name : place.alias
      nameCell.className = 'bright'

      // Opening hours
      const openCell = row.insertCell()
      openCell.style = 'padding-left: 8px;'
      const currentTime = moment()
      const state = hasPeriods(place) && !isAlwaysOpen(place)
        ? getOpeningState(place.opening_hours.periods, currentTime)
        : undefined

      if (isAlwaysOpen(place)) {
        openCell.innerHTML = this.translate('ALWAYS_OPEN')
      } else if (state === undefined) {
        openCell.innerHTML = this.translate('NOT_AVAILABLE')
      } else {
        this.debugLog('Opening state: ', JSON.stringify(state))
        const openCellTable = document.createElement('table')

        // Text
        const openTextCell = openCellTable.insertRow()
        openTextCell.innerHTML = state.isOpen ? this.translate('OPEN') : this.translate('CLOSED')
        openTextCell.className = 'xsmall'
        openTextCell.style = state.isOpen ? 'color: green;' : 'color: red;'

        // Hours
        const openingHoursCell = openCellTable.insertRow()
        openingHoursCell.className = 'xsmall'
        if (this.config.styling.showTimeUntil) {
          // Show time until closing/opening
          if (state.isOpen) {
            const timeUntilClosing = moment.duration(state.closingTime.diff(currentTime)).humanize()
            openingHoursCell.innerHTML = this.translate('CLOSES_IN', { timeUntilClosing: timeUntilClosing })
          } else if (state.openingTime !== undefined) {
            const timeUntilOpen = moment.duration(state.openingTime.diff(currentTime)).humanize()
            openingHoursCell.innerHTML = this.translate('OPENS_IN', { timeUntilOpen: timeUntilOpen })
          }
        } else {
          // Show only time when closing/opening
          if (state.isOpen) {
            // Closing after midnight reads fine without a day. Only name the day when it is more than 24h away.
            const showDay = state.closingTime.diff(currentTime, 'hours', true) >= 24
            openingHoursCell.textContent = this.translate('CLOSES') + ' ' + this.formatTime(state.closingTime, currentTime, timeFormat, showDay)
          } else if (state.openingTime !== undefined) {
            openingHoursCell.textContent = this.translate('OPENS') + ' ' + this.formatTime(state.openingTime, currentTime, timeFormat, true)
          }
        }
        openCell.appendChild(openCellTable)
      }
    })
    container.appendChild(table)
    container.className = this.config.styling.size

    wrapper.appendChild(container)
    return wrapper
  },

  // 'HH:mm' today, 'tomorrow HH:mm' tomorrow, otherwise 'Mon HH:mm' (weekday in the configured language).
  formatTime: function (time, currentTime, timeFormat, showDay) {
    const clock = time.format(timeFormat)
    if (!showDay) return clock
    const today = currentTime.clone().startOf('day')
    const days = time.clone().startOf('day').diff(today, 'days')
    if (days === 0) return clock
    if (days === 1) return this.translate('TOMORROW') + ' ' + clock
    return time.format('ddd') + ' ' + clock
  },

  socketNotificationReceived: function (notification, payload) {
    this.debugLog('Notification - ', notification)
    if (notification === 'PLACES_UPDATE') {
      this.loaded = true
      this.failure = undefined
      this.placesOpeningHours = payload
      this.updateDom()
    }
    if (notification === 'SERVICE_FAILURE') {
      // Keep showing the last known hours rather than replacing them with an error.
      if (this.placesOpeningHours !== undefined) {
        Log.log('Service failure, keeping last known opening hours: ', payload)
        return
      }
      this.failure = payload
      this.loaded = true
      Log.log('Service failure: ', this.failure)
      this.updateDom()
    }
  },

  debugLog: function (msg, object) {
    if (this.config.debug) {
      Log.log('[' + new Date(Date.now()).toLocaleTimeString() + '] - DEBUG - ' + this.name + ' : ' + msg, object)
    }
  }
})
