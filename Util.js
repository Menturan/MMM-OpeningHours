export function getNextOpenDay (opening_hours, startDay) {
  for (let i = 1; i < 7; i++) {
    const nextOpenDay = opening_hours[moment().weekday(startDay + i)]
    if (nextOpenDay !== undefined) {
      return nextOpenDay
    }
  }
}

export function parse_opening_hours (periods) {
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
  debugLog('Periods parsed: ', JSON.stringify(res))
  return res
}
