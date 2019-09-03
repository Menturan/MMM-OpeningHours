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
    debug: false,
    mockData: false
  },

  getTranslations () {
    switch (this.config.language) {
      case 'en':
        return { en: 'translations/en.json' }
      case 'sv':
        return { sv: 'translations/sv.json' }
      case 'es':
        return { es: 'translations/es.json' }
      default:
        return { en: 'translations/en.json' }
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
    debugLog('Default config: ', this.defaults)
    debugLog('Config: ', this.config)
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
      container.innerHTML = this.failure
      container.className = 'dimmed light small'
      wrapper.appendChild(container)
      return wrapper
    }

    let table = document.createElement('table')
    table.className = 'normal'
    this.placesOpeningHours.forEach(place => {
      debugLog('Place name: ', place.name)
      debugLog('Place id: ', place.place_id)
      let row = table.insertRow()
      // Name
      let nameCell = row.insertCell()
      nameCell.innerHTML = place.alias === undefined ? place.name : place.alias;
      nameCell.className = 'bright'
      // Opening hours

      let openCell = row.insertCell()
      openCell.style = 'padding-left: 8px;'
      if (place.opening_hours !== undefined) {
        if (!isAlwaysOpen(place)) {
          let openCellTable = document.createElement('table')
          const currentTime = moment() // this.config.mockData ? moment('21:00', 'HH:mm') : moment()
          debugLog('Moment now: ', currentTime.format('HH:mm'))

          const opening_hours = parse_opening_hours(place.opening_hours.periods)
          debugLog('Periods parsed: ', JSON.stringify(opening_hours))

          const [openingTime, closingTime, placeIsOpen] = calculateOpeningHours(opening_hours, currentTime);

          // Text
          let openTextCell = openCellTable.insertRow()
          openTextCell.innerHTML = placeIsOpen ? this.translate('OPEN') : this.translate('CLOSED')
          openTextCell.className = 'xsmall'
          openTextCell.style = placeIsOpen ? 'color: green;' : 'color: red;'

          // Hours
          let openingHoursCell = openCellTable.insertRow()
          openingHoursCell.className = 'xsmall'
          // Show time until closing/opening
          if (this.config.styling.showTimeUntil) {
            if (placeIsOpen) {
              let timeUntilClosing = moment.duration(closingTime.diff(currentTime)).humanize()
              openingHoursCell.innerHTML = this.translate('CLOSES_IN', { 'timeUntilClosing': timeUntilClosing })
            } else {
              let timeUntilOpen = moment.duration(currentTime.diff(openingTime)).humanize()
              openingHoursCell.innerHTML = this.translate('OPENS_IN', { 'timeUntilOpen': timeUntilOpen })

            }
            // Show only time when closing/opening
          } else {
            if (placeIsOpen) {
              openingHoursCell.innerHTML = this.translate('CLOSES') + ' ' + closingTime.format('HH:mm')
            } else {
              openingHoursCell.innerHTML = this.translate('OPENS') + ' ' + openingTime.format('HH:mm')
            }
          }

          openCell.appendChild(openCellTable)
        } else {
          openCell.innerHTML = this.translate('ALWAYS_OPEN')
        }
      } else {
        openCell.innerHTML = this.translate('NOT_AVAILABLE')
      }
    })
    container.appendChild(table)
    container.className = this.config.styling.size

    wrapper.appendChild(container)
    return wrapper
  },

  socketNotificationReceived: function (notification, payload) {
    debugLog('Notification - ', notification)
    if (notification === 'PLACES_UPDATE') {
      this.loaded = true
      this.failure = undefined
      this.placesOpeningHours = payload
      this.updateDom()
    }
    if (notification === 'SERVICE_FAILURE') {
      this.failure = payload
      this.loaded = true
      Log.log('Service failure: ', this.failure)
      this.updateDom()
    }
  },
})

function debugLog (msg, object) {
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

