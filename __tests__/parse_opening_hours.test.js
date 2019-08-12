var moment = require('moment')
const {parse_opening_hours} = require('../Parsers.js')
const { getPlaceFromFile } = require('../testUtil.js')

const place = getPlaceFromFile('mock_data/open_some_days.json')
const placeOpeningHours = place.json.result.opening_hours.periods;

describe("Correctly parses place that are open thursday, friday and saturday from 22-03.", () => {
  test("contains 3 periods", () => {
    expect(Object.keys(parse_opening_hours(placeOpeningHours)).length).toBe(3);
  });
  test("first period opens on thursday 2200 and closes on friday 0300", () => {
    const first_period = parse_opening_hours(placeOpeningHours)[4]
    expect(first_period.open.format()).toBe(moment('2200', 'HHmm').weekday(4).format());
    expect(first_period.close.format()).toBe(moment('0300', 'HHmm').weekday(5).format());
  });
});