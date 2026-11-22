/*
 * Works out whether a place is open, and when it next opens or closes.
 *
 * Runs in the browser, where MagicMirror provides `moment` as a global, and in
 * Node for the tests.
 *
 * `periods` uses the internal shape: [{ open: { day, time: 'HHmm', date? }, close: { ... } }],
 * with day 0 = Sunday. Periods with a `date` (Places API (New) currentOpeningHours)
 * are used as-is. Periods without one are weekly and repeat every week.
 *
 * Always use moment's locale-independent `.day()` here. `.weekday()` depends on
 * the locale's first day of the week, which shifts every day by one in
 * Monday-first locales such as 'sv'.
 */

var isServerSide = typeof window === 'undefined'
if (isServerSide) {
  var moment = require('moment')
}

function pointToMoment (weekStart, point) {
  return weekStart.clone()
    .add(point.day, 'days')
    .hour(parseInt(point.time.slice(0, 2), 10))
    .minute(parseInt(point.time.slice(2, 4), 10))
}

/*
 * Returns { isOpen, openingTime, closingTime } as moments, or undefined if the
 * periods contain no usable open/close pair.
 *   isOpen === true:  openingTime/closingTime belong to the current period.
 *   isOpen === false: openingTime/closingTime belong to the next period, or are
 *                     undefined if no opening is known in the data.
 */
function getOpeningState (periods, currentTime) {
  // Sunday 00:00 of the current week, whatever the locale.
  const weekStart = currentTime.clone().startOf('day').subtract(currentTime.day(), 'days')

  // Build each period for last week, this week and next week. That covers
  // periods that span midnight or the Saturday -> Sunday week boundary.
  const intervals = []
  periods.filter(p => p && p.open && p.close).forEach(p => {
    if (p.open.date && p.close.date) {
      intervals.push({
        open: moment(p.open.date + ' ' + p.open.time, 'YYYY-MM-DD HHmm'),
        close: moment(p.close.date + ' ' + p.close.time, 'YYYY-MM-DD HHmm')
      })
      return
    }
    [-7, 0, 7].forEach(offset => {
      const start = weekStart.clone().add(offset, 'days')
      const open = pointToMoment(start, p.open)
      const close = pointToMoment(start, p.close)
      if (!close.isAfter(open)) close.add(7, 'days')
      intervals.push({ open, close })
    })
  })
  if (intervals.length === 0) return undefined
  intervals.sort((a, b) => a.open.valueOf() - b.open.valueOf())

  // Merge back-to-back periods (e.g. 18:00-00:00 followed by 00:00-02:00, or a
  // truncated 23:59 close), so the module shows the real closing time.
  const merged = [intervals[0]]
  intervals.slice(1).forEach(i => {
    const last = merged[merged.length - 1]
    if (i.open.diff(last.close, 'minutes') <= 1) {
      if (i.close.isAfter(last.close)) last.close = i.close
    } else {
      merged.push(i)
    }
  })

  const current = merged.find(i => !currentTime.isBefore(i.open) && currentTime.isBefore(i.close))
  if (current) {
    return { isOpen: true, openingTime: current.open, closingTime: current.close }
  }
  const next = merged.find(i => i.open.isAfter(currentTime))
  // No next opening is only possible with dated periods: the place stays closed
  // for the rest of the seven-day window Google returned (holidays, or stale data).
  if (!next) return { isOpen: false, openingTime: undefined, closingTime: undefined }
  return { isOpen: false, openingTime: next.open, closingTime: next.close }
}

if (isServerSide) {
  module.exports = { getOpeningState }
}
