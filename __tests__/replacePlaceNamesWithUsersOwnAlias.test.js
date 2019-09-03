const {replacePlaceNamesWithUsersOwnAlias} = require('../backendUtil.js')
const { getPlaceFromFile } = require('../testUtil.js')

const config_places_id_list = [["ChIJs4cQo1ydX0YRkoCF1aFt_YA", "Hello World"], "uber-id"]

const place1 = getPlaceFromFile('mock_data/open_some_days.json')
const place2 = getPlaceFromFile('mock_data/24hour.json')
const placesOpeningHours = [place1.json.result, place2.json.result];

describe("Correctly inserts alias to place if provided by user config", () => {
    test("contains alias 'Hello World'", () => {
        const res = replacePlaceNamesWithUsersOwnAlias(placesOpeningHours, config_places_id_list);
        expect(res[0].alias).toBe("Hello World");
        expect(res[1].alias).toBeUndefined();
    });
});