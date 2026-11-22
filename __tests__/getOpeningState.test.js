const moment = require('moment')
const { getOpeningState, getTodaysIntervals, placeTime } = require('../OpeningHoursLogic.js')
const { normalizePlaceLegacy, normalizePlaceNew } = require('../placesApi.js')
const { getPlaceFromFile } = require('../testUtil.js')

const legacyPeriods = (file) => normalizePlaceLegacy(getPlaceFromFile('mock_data/' + file).json.result).opening_hours.periods
const newPeriods = (file) => normalizePlaceNew(getPlaceFromFile('mock_data/places_new/' + file).json).opening_hours.periods

// 2019-06-02 was a Sunday, so 2019-06-0X is easy to read: 02 Sun, 03 Mon ... 08 Sat.
const at = (isoLocal) => moment(isoLocal, 'YYYY-MM-DDTHH:mm')
const fmt = (m) => m.format('ddd HH:mm')

afterEach(() => moment.locale('en'))

describe('Place open Thursday, Friday and Saturday 22-03 (open_some_days)', () => {
  const periods = legacyPeriods('open_some_days.json')

  test('on Sunday afternoon the next opening is Thursday 22:00 (was the getNextOpenDay test)', () => {
    const state = getOpeningState(periods, at('2019-06-02T15:00'))
    expect(state.isOpen).toBe(false)
    expect(fmt(state.openingTime)).toBe('Thu 22:00')
    expect(fmt(state.closingTime)).toBe('Fri 03:00')
  })

  test('Thursday 23:00 is open, closes Friday 03:00 (was the parse_opening_hours test)', () => {
    const state = getOpeningState(periods, at('2019-06-06T23:00'))
    expect(state.isOpen).toBe(true)
    expect(fmt(state.openingTime)).toBe('Thu 22:00')
    expect(fmt(state.closingTime)).toBe('Fri 03:00')
  })

  test('Sunday 01:00 is still open from Saturday night (week boundary)', () => {
    const state = getOpeningState(periods, at('2019-06-09T01:00'))
    expect(state.isOpen).toBe(true)
    expect(fmt(state.closingTime)).toBe('Sun 03:00')
    expect(state.closingTime.format('YYYY-MM-DD')).toBe('2019-06-09')
  })

  test('the same answers from the Places API (New) mock', () => {
    expect(getOpeningState(newPeriods('open_some_days.json'), at('2019-06-09T01:00')))
      .toEqual(getOpeningState(periods, at('2019-06-09T01:00')))
  })
})

describe('Weekdays do not depend on the locale', () => {
  test("in 'sv' (week starts Monday) a Monday uses Monday's hours", () => {
    moment.locale('sv')
    const periods = newPeriods('closed_mon_sun.json') // closed Sunday and Monday
    const state = getOpeningState(periods, at('2019-06-03T12:00')) // Monday noon
    expect(state.isOpen).toBe(false)
    expect(state.openingTime.format('YYYY-MM-DD HH:mm')).toBe('2019-06-04 10:00') // Tuesday
  })

  test("in 'sv' Saturday has Saturday's hours", () => {
    moment.locale('sv')
    const state = getOpeningState(newPeriods('closed_mon_sun.json'), at('2019-06-08T15:00'))
    expect(state.isOpen).toBe(true)
    expect(state.closingTime.format('YYYY-MM-DD HH:mm')).toBe('2019-06-08 16:00')
  })
})

describe('Several periods on one day (lunch break)', () => {
  const periods = newPeriods('lunch_break.json')

  test('open in the morning, closes at 12', () => {
    const state = getOpeningState(periods, at('2019-06-04T10:00'))
    expect(state.isOpen).toBe(true)
    expect(fmt(state.closingTime)).toBe('Tue 12:00')
  })

  test('closed over lunch, opens again at 13', () => {
    const state = getOpeningState(periods, at('2019-06-04T12:30'))
    expect(state.isOpen).toBe(false)
    expect(fmt(state.openingTime)).toBe('Tue 13:00')
  })

  test('Friday evening, next opening is Monday 09:00', () => {
    const state = getOpeningState(periods, at('2019-06-07T18:00'))
    expect(state.isOpen).toBe(false)
    expect(state.openingTime.format('YYYY-MM-DD HH:mm')).toBe('2019-06-10 09:00')
  })
})

describe('Edge cases', () => {
  test('opening and closing minute boundaries', () => {
    const periods = newPeriods('normal.json')
    expect(getOpeningState(periods, at('2019-06-04T08:00')).isOpen).toBe(true)
    expect(getOpeningState(periods, at('2019-06-04T22:00')).isOpen).toBe(false)
  })

  test('evening until night: Monday 01:00 is open from Sunday', () => {
    const state = getOpeningState(newPeriods('open_eve_til_night.json'), at('2019-06-03T01:00'))
    expect(state.isOpen).toBe(true)
    expect(fmt(state.openingTime)).toBe('Sun 20:00')
  })

  test('no usable periods gives undefined', () => {
    expect(getOpeningState([], at('2019-06-04T10:00'))).toBeUndefined()
    expect(getOpeningState([{ open: { day: 0, time: '0000' } }], at('2019-06-04T10:00'))).toBeUndefined()
  })
})

describe('Back-to-back periods', () => {
  test('a period ending at midnight merges with one starting at midnight', () => {
    const periods = [
      { open: { day: 1, time: '1800' }, close: { day: 2, time: '0000' } },
      { open: { day: 2, time: '0000' }, close: { day: 2, time: '0200' } }
    ]
    const state = getOpeningState(periods, at('2019-06-03T23:00'))
    expect(state.isOpen).toBe(true)
    expect(fmt(state.closingTime)).toBe('Tue 02:00')
  })
})

describe('Dated periods from currentOpeningHours (holidays)', () => {
  const periods = newPeriods('holiday_closed.json') // Mon 21 - Wed 23 Dec 2026 open, Thu 24 and Fri 25 closed

  test('Wednesday evening: closed, with no known opening in the window (Thu/Fri are holidays)', () => {
    expect(getOpeningState(periods, at('2026-12-23T18:00')))
      .toEqual({ isOpen: false, openingTime: undefined, closingTime: undefined })
  })

  test('Tuesday 10:00 is open until 17:00 the same day', () => {
    const state = getOpeningState(periods, at('2026-12-22T10:00'))
    expect(state.isOpen).toBe(true)
    expect(state.closingTime.format('YYYY-MM-DD HH:mm')).toBe('2026-12-22 17:00')
  })

  test('Monday 07:00 opens at 09:00 the same day', () => {
    const state = getOpeningState(periods, at('2026-12-21T07:00'))
    expect(state.isOpen).toBe(false)
    expect(state.openingTime.format('YYYY-MM-DD HH:mm')).toBe('2026-12-21 09:00')
  })
})

describe('places in another time zone (utcOffsetMinutes)', () => {
  // Tests run in UTC (jest.config.js). Open Tuesday 09-17 local time.
  const periods = [{ open: { day: 2, time: '0900' }, close: { day: 2, time: '1700' } }]

  test('weekly hours are read in the place\'s own time', () => {
    // Tue 01:00 UTC = Tue 10:00 at UTC+9.
    const state = getOpeningState(periods, at('2019-06-04T01:00'), 540)
    expect(state.isOpen).toBe(true)
    expect(state.closingTime.format('ddd HH:mm Z')).toBe('Tue 17:00 +09:00')
    // Without the offset the same moment is Tue 01:00, closed.
    expect(getOpeningState(periods, at('2019-06-04T01:00')).isOpen).toBe(false)
  })

  test('the place\'s weekday can differ from the mirror\'s', () => {
    // Mon 23:30 UTC = Tue 08:30 at UTC+9: opens in 30 minutes, the same day for the place.
    const state = getOpeningState(periods, at('2019-06-03T23:30'), 540)
    expect(state.isOpen).toBe(false)
    expect(state.openingTime.format('YYYY-MM-DD HH:mm')).toBe('2019-06-04 09:00')
  })

  test('dated periods are read in the place\'s own time', () => {
    const dated = [{ open: { day: 2, time: '0900', date: '2019-06-04' }, close: { day: 2, time: '1700', date: '2019-06-04' } }]
    const state = getOpeningState(dated, at('2019-06-04T07:59'), 540) // 16:59 at UTC+9
    expect(state.isOpen).toBe(true)
    expect(state.closingTime.diff(at('2019-06-04T07:59'), 'minutes')).toBe(1)
  })

  test('the same offset as the mirror uses the local time zone (keeps daylight saving)', () => {
    const now = at('2019-06-04T10:00')
    expect(placeTime(now, now.utcOffset()).utcOffset()).toBe(now.utcOffset())
    expect(placeTime(now, undefined).valueOf()).toBe(now.valueOf())
  })
})

describe('getTodaysIntervals', () => {
  const span = i => i.open.format('ddd HH:mm') + '-' + i.close.format('ddd HH:mm')

  test('lists today\'s intervals, split by a break', () => {
    const periods = [
      { open: { day: 2, time: '0900' }, close: { day: 2, time: '1200' } },
      { open: { day: 2, time: '1300' }, close: { day: 2, time: '1800' } },
      { open: { day: 3, time: '0900' }, close: { day: 3, time: '1800' } }
    ]
    expect(getTodaysIntervals(periods, at('2019-06-04T08:00')).map(span)).toEqual(['Tue 09:00-Tue 12:00', 'Tue 13:00-Tue 18:00'])
  })

  test('includes last night\'s period only while it is still open', () => {
    const periods = legacyPeriods('open_some_days.json') // Thu-Sat 22-03
    expect(getTodaysIntervals(periods, at('2019-06-09T01:00')).map(span)).toEqual(['Sat 22:00-Sun 03:00'])
    expect(getTodaysIntervals(periods, at('2019-06-09T15:00'))).toEqual([])
  })

  test('undefined when there are no usable periods', () => {
    expect(getTodaysIntervals([], at('2019-06-04T08:00'))).toBeUndefined()
  })
})
