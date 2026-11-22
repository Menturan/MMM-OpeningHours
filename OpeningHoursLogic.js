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
 * `utcOffsetMinutes` is the place's offset from UTC. When it differs from the
 * mirror's own offset, all times are worked out in the place's time, so a place
 * in another time zone shows its own opening and closing times. When it is the
 * same, or unknown, the mirror's local time zone is used, which also handles
 * daylight saving changes during the week.
 *
 * Always use moment's locale-independent `.day()` here. `.weekday()` depends on
 * the locale's first day of the week, which shifts every day by one in
 * Monday-first locales such as 'sv'.
 */

/* eslint-disable no-var */
// Plain browser script: `var` keeps these as globals shared with MagicMirror's own `moment`.
var isServerSide = typeof window === 'undefined'
if (isServerSide) {
  var moment = require('moment')
}
/* eslint-enable no-var */

/*
 * currentTime in the place's own time, or a plain copy when the place shares
 * the mirror's offset (or the offset is unknown).
 */
function placeTime (currentTime, utcOffsetMinutes) {
  if (typeof utcOffsetMinutes !== 'number' || utcOffsetMinutes === currentTime.utcOffset()) {
    return currentTime.clone()
  }
  return currentTime.clone().utcOffset(utcOffsetMinutes)
}

function pointToMoment (weekStart, point) {
  return weekStart.clone()
    .add(point.day, 'days')
    .hour(parseInt(point.time.slice(0, 2), 10))
    .minute(parseInt(point.time.slice(2, 4), 10))
}

/*
 * All periods as concrete open/close intervals around currentTime (last week,
 * this week and next week), sorted and with back-to-back periods merged.
 * `now` must already be in the place's time (see placeTime).
 */
function buildIntervals (periods, now, fixedOffset) {
  // Sunday 00:00 of the current week, whatever the locale.
  const weekStart = now.clone().startOf('day').subtract(now.day(), 'days')
  const parseDated = point => fixedOffset
    ? moment.utc(point.date + ' ' + point.time, 'YYYY-MM-DD HHmm').utcOffset(now.utcOffset(), true)
    : moment(point.date + ' ' + point.time, 'YYYY-MM-DD HHmm')

  // Building each weekly period three times covers periods that span midnight
  // or the Saturday -> Sunday week boundary.
  const intervals = []
  periods.filter(p => p && p.open && p.close).forEach(p => {
    if (p.open.date && p.close.date) {
      intervals.push({ open: parseDated(p.open), close: parseDated(p.close) })
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
  intervals.sort((a, b) => a.open.valueOf() - b.open.valueOf())

  // Merge back-to-back periods (e.g. 18:00-00:00 followed by 00:00-02:00, or a
  // truncated 23:59 close), so the module shows the real closing time.
  const merged = []
  intervals.forEach(i => {
    const last = merged[merged.length - 1]
    if (last && i.open.diff(last.close, 'minutes') <= 1) {
      if (i.close.isAfter(last.close)) last.close = i.close
    } else {
      merged.push(i)
    }
  })
  return merged
}

function intervalsFor (periods, currentTime, utcOffsetMinutes) {
  const now = placeTime(currentTime, utcOffsetMinutes)
  const fixedOffset = typeof utcOffsetMinutes === 'number' && utcOffsetMinutes !== currentTime.utcOffset()
  return { now, intervals: buildIntervals(periods, now, fixedOffset) }
}

/*
 * Returns { isOpen, openingTime, closingTime } as moments, or undefined if the
 * periods contain no usable open/close pair.
 *   isOpen === true:  openingTime/closingTime belong to the current period.
 *   isOpen === false: openingTime/closingTime belong to the next period, or are
 *                     undefined if no opening is known in the data.
 */
function getOpeningState (periods, currentTime, utcOffsetMinutes) {
  const { now, intervals } = intervalsFor(periods, currentTime, utcOffsetMinutes)
  if (intervals.length === 0) return undefined

  const current = intervals.find(i => !now.isBefore(i.open) && now.isBefore(i.close))
  if (current) {
    return { isOpen: true, openingTime: current.open, closingTime: current.close }
  }
  const next = intervals.find(i => i.open.isAfter(now))
  // No next opening is only possible with dated periods: the place stays closed
  // for the rest of the seven-day window Google returned (holidays, or stale data).
  if (!next) return { isOpen: false, openingTime: undefined, closingTime: undefined }
  return { isOpen: false, openingTime: next.open, closingTime: next.close }
}

/*
 * Today's opening intervals ({ open, close } moments, in the place's time): the
 * ones that open today, plus the current one if it opened earlier (e.g. a bar
 * still open from last night). Returns undefined if the periods are unusable.
 */
function getTodaysIntervals (periods, currentTime, utcOffsetMinutes) {
  const { now, intervals } = intervalsFor(periods, currentTime, utcOffsetMinutes)
  if (intervals.length === 0) return undefined
  const dayStart = now.clone().startOf('day')
  const dayEnd = dayStart.clone().add(1, 'day')
  return intervals.filter(i =>
    (!i.open.isBefore(dayStart) && i.open.isBefore(dayEnd)) ||
    (i.open.isBefore(dayStart) && !now.isBefore(i.open) && now.isBefore(i.close)))
}

if (isServerSide) {
  module.exports = { getOpeningState, getTodaysIntervals, placeTime }
}
