var moment = require('moment')
const { isAlwaysOpen } = require('../Parsers.js')
const { getPlaceFromFile } = require('../testUtil.js')

// Google Places API docs: https://developers.google.com/places/web-service/details#PlaceDetailsResults
const place = getPlaceFromFile('mock_data/24hour.json')

describe("Correctly parses place that are open 24/7", () => {
  test("should return true for always open", () => {   
    expect(isAlwaysOpen(place.json.result)).toBe(true);
  });
});