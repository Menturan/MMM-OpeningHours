var isServerSide = true
try{
  var dummy = window !== undefined
  isServerSide = false
}catch (e) {
  // Do nothing...
}


if (isServerSide) {
  var moment = require('moment');
}

function getNextOpenDay(opening_hours, startDay) {
  for (let i = 1; i < 7; i++) {
    const nextOpenDay = opening_hours[moment().weekday(startDay + i).weekday()]
    if (nextOpenDay !== undefined) {
      return nextOpenDay
    }
  }
}

function parse_opening_hours(periods) {
  /* Results in following structure
  { 0: {close: moment(), open: moment()}
    1: {close: moment(), open: moment()}
    2: {close: moment(), open: moment()} }
  */
  let res = {}
  periods.forEach(period => {
    let p = {}
    p.close = moment(period.close.time, 'HHmm').weekday(period.close.day)
    p.open = moment(period.open.time, 'HHmm').weekday(period.open.day)
    res[period.open.day] = p
  })
  return res
}

function isAlwaysOpen(place) { 
  // See note in docs. opening_hours -> periods -> close: https://developers.google.com/places/web-service/details#PlaceDetailsResults
  const firstPeriod = place.opening_hours.periods[0]
  return firstPeriod.open.day === 0 && firstPeriod.open.time === '0000' && firstPeriod.close === undefined
}

if (isServerSide) {
  module.exports = { parse_opening_hours, getNextOpenDay, isAlwaysOpen };
}
