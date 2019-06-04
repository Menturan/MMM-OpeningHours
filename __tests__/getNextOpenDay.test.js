const parse_opening_hours = require('../Util.js')

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


test("Correctly parses place that are open thursday, friday and saturday from 22-03.", () =>{
  expect(parse_opening_hours(period1)).toBe(3);
});