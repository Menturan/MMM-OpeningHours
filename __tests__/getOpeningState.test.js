const moment = require('moment')
const { getOpeningState } = require('../OpeningHoursLogic.js')
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
