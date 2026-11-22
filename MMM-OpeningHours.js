/*
 * Notifications from node_helper (payload always has `identifier`; others' are ignored):
 *      PLACES_UPDATE:   { places } when places opening hours gets fetch/refetch.
 *      SERVICE_FAILURE: { message } when the service access failed.
 */

Module.register('MMM-OpeningHours', {
  // Module defaults
  defaults: {
    googleApiKey: undefined,
    places: [],
    scheduleTime: 60000 * 60 * 24,
    timeFormat: config.timeFormat,
    language: config.language,
    hideClosed: false, // Hide places that are closed right now.
    sortOpenFirst: false, // Show open places first, then closed, then those without hours.
    styling: {
      showTimeUntil: false,
      showTodaysHours: false, // Add a row with all of today's opening hours.
      closingSoonMinutes: 30, // Mark a place as closing soon this many minutes before it closes. 0 turns it off.
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
    return [this.file('MMM-OpeningHours.css')]
  },

  // Start the module
  start: function () {
    Log.log('Starting module: ' + this.name)
    this.config.styling = { ...this.defaults.styling, ...this.config.styling }
    this.debugLog('Config: ', { ...this.config, googleApiKey: this.config.googleApiKey ? '***' : this.config.googleApiKey })
    this.loaded = false
    moment.locale(this.config.language)
    if (this.config.googleApiKey === undefined || this.config.googleApiKey === '') {
      this.failure = this.translate('NO_API_KEY_PROVIDED')
      this.loaded = true
    } else if (this.config.places.length === 0) {
      this.failure = this.translate('NO_PLACES_PROVIDED')
      this.loaded = true
    } else {
      // Send config to helper and initiate an update. The identifier keeps several instances apart.
      this.sendSocketNotification('SETUP', { identifier: this.identifier, config: this.config })
    }

    // Schedule update interval for ui.
    setInterval(() => this.updateDom(), 1000 * 60) // 1min
  },

  getHeader: function () {
    return this.data.header
  },

  // Everything getDom needs for one place, worked out once.
  placeState: function (place, currentTime) {
    if (isAlwaysOpen(place)) return { kind: 'always' }
    if (!hasPeriods(place)) return { kind: 'unknown' }
    const offset = place.utc_offset_minutes
    const state = getOpeningState(place.opening_hours.periods, currentTime, offset)
    if (state === undefined) return { kind: 'unknown' }
    return { kind: state.isOpen ? 'open' : 'closed', state, currentTime, now: placeTime(currentTime, offset) }
  },

  getDom: function () {
    const wrapper = document.createElement('div')
    wrapper.className = 'MMM-OpeningHours-wrapper'
    const container = document.createElement('div')
    container.style.textAlign = this.config.styling.textAlign

    // Loading
    if (!this.loaded) {
      container.textContent = this.translate('LOADING_MODULE')
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

    const currentTime = moment()
    let rows = this.placesOpeningHours.map(place => ({ place, ...this.placeState(place, currentTime) }))
    if (this.config.hideClosed) {
      rows = rows.filter(row => row.kind !== 'closed')
    }
    if (this.config.sortOpenFirst) {
      const rank = { open: 0, always: 0, closed: 1, unknown: 2 }
      rows = rows.map((row, index) => ({ row, index }))
        .sort((a, b) => rank[a.row.kind] - rank[b.row.kind] || a.index - b.index)
        .map(item => item.row)
    }

    if (rows.length === 0) {
      container.textContent = this.translate('ALL_CLOSED')
      container.className = 'dimmed light ' + this.config.styling.size
      wrapper.appendChild(container)
      return wrapper
    }

    const table = document.createElement('table')
    table.className = 'normal'
    rows.forEach(row => this.renderRow(table, row))
    container.appendChild(table)
    container.className = this.config.styling.size

    wrapper.appendChild(container)
    return wrapper
  },

  renderRow: function (table, { place, kind, state, currentTime, now }) {
    const timeFormat = this.config.timeFormat === 12 ? 'h:mm A' : 'HH:mm'
    this.debugLog('Place: ', place.name + ' (' + place.place_id + ')')
    const row = table.insertRow()
    // Name. textContent, not innerHTML: the name comes from Google or the config.
    const nameCell = row.insertCell()
    nameCell.textContent = place.alias === undefined ? place.name : place.alias
    nameCell.className = 'bright'

    // Opening hours
    const openCell = row.insertCell()
    openCell.className = 'MMM-OpeningHours-hours'

    if (kind === 'always') {
      openCell.textContent = this.translate('ALWAYS_OPEN')
      return
    }
    if (kind === 'unknown') {
      openCell.textContent = this.translate('NOT_AVAILABLE')
      return
    }

    this.debugLog('Opening state: ', JSON.stringify(state))
    const openCellTable = document.createElement('table')

    const minutesLeft = state.isOpen ? state.closingTime.diff(now, 'minutes', true) : undefined
    const closingSoon = state.isOpen && this.config.styling.closingSoonMinutes > 0 &&
      minutesLeft <= this.config.styling.closingSoonMinutes

    // Text
    const openTextCell = openCellTable.insertRow().insertCell()
    openTextCell.textContent = state.isOpen ? this.translate('OPEN') : this.translate('CLOSED')
    openTextCell.className = 'xsmall ' + (closingSoon ? 'MMM-OpeningHours-closing-soon' : state.isOpen ? 'MMM-OpeningHours-open' : 'MMM-OpeningHours-closed')

    // Hours
    const openingHoursCell = openCellTable.insertRow().insertCell()
    openingHoursCell.className = 'xsmall'
    if (this.config.styling.showTimeUntil) {
      // Show time until closing/opening
      if (state.isOpen) {
        const timeUntilClosing = moment.duration(state.closingTime.diff(now)).humanize()
        openingHoursCell.textContent = this.translate('CLOSES_IN', { timeUntilClosing })
      } else if (state.openingTime !== undefined) {
        const timeUntilOpen = moment.duration(state.openingTime.diff(now)).humanize()
        openingHoursCell.textContent = this.translate('OPENS_IN', { timeUntilOpen })
      }
    } else {
      // Show only time when closing/opening
      if (state.isOpen) {
        // Closing after midnight reads fine without a day. Only name the day when it is more than 24h away.
        const showDay = state.closingTime.diff(now, 'hours', true) >= 24
        openingHoursCell.textContent = this.translate('CLOSES') + ' ' + this.formatTime(state.closingTime, now, timeFormat, showDay)
      } else if (state.openingTime !== undefined) {
        openingHoursCell.textContent = this.translate('OPENS') + ' ' + this.formatTime(state.openingTime, now, timeFormat, true)
      }
    }

    // All of today's hours, e.g. "Today: 09:00–12:00, 13:00–18:00"
    if (this.config.styling.showTodaysHours) {
      const today = getTodaysIntervals(place.opening_hours.periods, currentTime, place.utc_offset_minutes) || []
      const todayCell = openCellTable.insertRow().insertCell()
      todayCell.className = 'xsmall dimmed'
      todayCell.textContent = this.translate('TODAY') + ': ' + (today.length === 0
        ? this.translate('CLOSED').toLowerCase()
        : today.map(i => i.open.format(timeFormat) + '–' + i.close.format(timeFormat)).join(', '))
    }

    openCell.appendChild(openCellTable)
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
    // node_helper broadcasts to every instance. Only handle our own.
    if (!payload || payload.identifier !== this.identifier) return
    this.debugLog('Notification - ', notification)
    if (notification === 'PLACES_UPDATE') {
      this.loaded = true
      this.failure = undefined
      this.placesOpeningHours = payload.places
      this.updateDom()
    }
    if (notification === 'SERVICE_FAILURE') {
      // Keep showing the last known hours rather than replacing them with an error.
      if (this.placesOpeningHours !== undefined) {
        Log.log('Service failure, keeping last known opening hours: ', payload.message)
        return
      }
      this.failure = payload.message
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
