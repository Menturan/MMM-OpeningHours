var moment = require('moment')
const {getNextOpenDay} = require('../Parsers.js')

var parsed_period = {"4":{"close":moment("2019-06-07T01:00:00.000Z"),"open":moment("2019-06-06T20:00:00.000Z")},"5":{"close":moment("2019-06-08T01:00:00.000Z"),"open":moment("2019-06-07T20:00:00.000Z")},"6":{"close":moment("2019-06-02T01:00:00.000Z"),"open":moment("2019-06-08T20:00:00.000Z")}}
describe("Retrives next open day.", () => {
  test("if sunday, the next open day should be thursday", () => {
    var nextOpenDay = getNextOpenDay(parsed_period, 6);
    expect(nextOpenDay.open.format()).toBe(moment("2019-06-06T20:00:00.000Z").format());
  });
});