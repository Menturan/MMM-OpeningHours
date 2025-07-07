const moment = require('moment')
const NodeHelper = require('node_helper')
const { Client } = require('@googlemaps/google-maps-services-js')
const fs = require('fs')
const util = require('./backendUtil')

let googleClient = undefined

module.exports = NodeHelper.create({

    start: function () {
        this.log('Starting helper: ', this.name)
        this.started = false
    },

    scheduleUpdate: function () {
        const self = this
        this.updatetimer = setInterval(function () {
            self.getOpeningHours()
        }, this.config.scheduleTime)
    },

    mockGooglePlacesApi(self, index) {
        self.log('Using mock data.')
        return new Promise(function (resolve, reject) {
            try {
                const files = fs.readdirSync('./modules/MMM-OpeningHours/mock_data')
                const file = files[index]
                const data = fs.readFileSync('./modules/MMM-OpeningHours/mock_data/' + file, 'utf8')
                resolve({
                    data: {
                        result: JSON.parse(data)
                    }
                })
            } catch (error) {
                reject(error)
            }
        })
    },

    getOpeningHours: function () {
        const self = this
        self.log('Fetching opening hours')
        let places = this.config.places
        if (this.config.mockData) {
            const files = fs.readdirSync('./modules/MMM-OpeningHours/mock_data')
            places = Array.from('x'.repeat(files.length))
        }

        let opening_hours_promises = places.map((place, index) => {
            if (Array.isArray(place)) {
                place = place[0]
            }

            let googlePromise
            if (this.config.mockData) {
                googlePromise = self.mockGooglePlacesApi(self, index)
            } else {
                self.log('Using Google Places API.')
                googlePromise = googleClient.placeDetails({
                    params: {
                        place_id: place || '',
                        fields: ['name', 'opening_hours', 'place_id'],
                        key: this.config.googleApiKey,
                        language: this.config.language
                    }
                })
            }

            return googlePromise.then(function (response) {
                self.debugLog('Response - ', JSON.stringify(response.data))
                return response.data.result
            }).catch(function (error) {
                self.log('Error: ', error)
            })
        })

        Promise.all(opening_hours_promises).then(function (result) {
            this.places = util.replacePlaceNamesWithUsersOwnAlias(result, places)
            self.debugLog('Sending to frontend - ', JSON.stringify(this.places))
            self.sendSocketNotification('PLACES_UPDATE', result)
        }.bind(this))
    },

    socketNotificationReceived: function (notification, payload) {
        const self = this
        this.config = payload
        self.debugLog('Notification - ' + notification)
        self.debugLog('Started - ' + this.started)
        self.debugLog('Config - ', this.config)

        if (notification === 'SETUP') {
            if (!this.config.mockData && !this.started) {
                moment.locale(this.config.language)
                googleClient = new Client()
                self.scheduleUpdate()
            }
            this.started = true
            self.getOpeningHours()
        } else {
            self.sendSocketNotification('PLACES_UPDATE', this.places)
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
