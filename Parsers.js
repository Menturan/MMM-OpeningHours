/*
 * Helpers for the internal place shape (see placesApi.js). Runs in the browser and in Node.
 */

function hasPeriods (place) {
  return place !== undefined && place !== null &&
    place.opening_hours !== undefined &&
    Array.isArray(place.opening_hours.periods) &&
    place.opening_hours.periods.length > 0
}

function isAlwaysOpen (place) {
  // Both API versions mark 24/7 as a single period that opens Sunday 00:00 and has no close.
  if (!hasPeriods(place)) return false
  const firstPeriod = place.opening_hours.periods[0]
  return place.opening_hours.periods.length === 1 &&
    firstPeriod.open.day === 0 && firstPeriod.open.time === '0000' && firstPeriod.close === undefined
}

if (typeof window === 'undefined') {
  module.exports = { hasPeriods, isAlwaysOpen }
}
