var moment = require('moment')
const {parse_opening_hours} = require('../Parsers.js')

var period1 =
  [
    {
      'close': {
        'day': 5,
        'time': '0300'
      },
      'open': {
        'day': 4,
        'time': '2200'
      }
    },
    {
      'close': {
        'day': 6,
        'time': '0300'
      },
      'open': {
        'day': 5,
        'time': '2200'
      }
    },
    {
      'close': {
        'day': 0,
        'time': '0300'
      },
      'open': {
        'day': 6,
        'time': '2200'
      }
    }
  ]

describe("Correctly parses place that are open thursday, friday and saturday from 22-03.", () => {
  test("contains 3 periods", () => {
    expect(Object.keys(parse_opening_hours(period1)).length).toBe(3);
  });
  test("first period opens on thursday 2200 and closes on friday 0300", () => {
    const first_period = parse_opening_hours(period1)[4]
    expect(first_period.open.format()).toBe(moment('2200', 'HHmm').weekday(4).format());
    expect(first_period.close.format()).toBe(moment('0300', 'HHmm').weekday(5).format());
  });
});