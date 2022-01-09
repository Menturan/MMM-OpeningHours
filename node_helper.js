var moment = require('moment')
const NodeHelper = require('node_helper')
var google = require('@google/maps')
var fs = require('fs')
var util = require("./backendUtil")
const OverpassFrontend = require('overpass-frontend')
const { result } = require('lodash')

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

    mockGooglePlacesApi(self, index) {
        self.log('Using mock data.')
        return new Promise(function (resolve, reject) {
            const files = fs.readdirSync('./modules/MMM-OpeningHours/mock_data')
            const file = files[index];
            const data = fs.readFileSync('./modules/MMM-OpeningHours/mock_data/' + file, 'utf8');
            resolve({
                json: JSON.parse(data)
            }).catch((error) => {
                reject(error);
            })
        })
    },

    mockGooglePlacesApiFromOSM(self, index) {
        self.log("Using OverpassAPI data.")
        return new Promise(function (resolve, reject) {


            // you may specify an OSM file as url, e.g. 'test/data.osm.bz2'
            const overpassFrontend = new OverpassFrontend('//overpass-api.de/api/interpreter')

            // request restaurants in the specified bounding box
            overpassFrontend.get(
                ['n311423696', 'n8661321105', "w82532728"],
                {
                properties: OverpassFrontend.TAGS
              },
              function (err, result) {
                if (result) {
                  console.log('* ' + result.tags.name + ' (' + result.id + ')')
                } else {
                  console.log('* empty result')
                }
              },
              function (err) {
                if (err) { console.log(err) }
              }
            )

            resolve({
                json: result
            }).catch((error) => {
                reject(error);
            })
        })
    },

    getOpeningHours: function () {
        var self = this
        self.log('Fetching opening hours')
        let places = this.config.places;
        if (this.config.mockData) {
            const files = fs.readdirSync('./modules/MMM-OpeningHours/mock_data')
            places = Array.from('x'.repeat(files.length));
        }
        let opening_hours_promises = places.map((place, index) => {
            if (Array.isArray(place)) {
                place = place[0] // place=[placeid, placename]
            }
            let googlePromise
            self.debugLog('config - ', this.config)
            if (this.config.mockData) {
                googlePromise = self.mockGooglePlacesApi(self, index)
            } else {
                googlePromise = self.mockGooglePlacesApiFromOSM(self, index)
                // self.log('Using Google Places API.')
                // googlePromise = googleClient.place({
                //     placeid: place === null ? '' : place,
                //     fields: ['name', 'opening_hours', 'place_id'],
                // }).asPromise()
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
            this.places = util.replacePlaceNamesWithUsersOwnAlias(result, places);

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
                    // googleClient = google.createClient({
                    //     key: this.config.googleApiKey,
                    //     Promise: Promise,
                    //     language: this.config.language
                    // })
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
