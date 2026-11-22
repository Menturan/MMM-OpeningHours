const { replacePlaceNamesWithUsersOwnAlias, getPlaceId } = require('../backendUtil.js')
const { getPlaceFromFile } = require('../testUtil.js')

const config_places_id_list = [['ChIJs4cQo1ydX0YRkoCF1aFt_YA', 'Hello World'], 'uber-id']

describe('Correctly inserts alias to place if provided by user config', () => {
  test("contains alias 'Hello World'", () => {
    const place1 = getPlaceFromFile('mock_data/open_some_days.json')
    const place2 = getPlaceFromFile('mock_data/24hour.json')
    const res = replacePlaceNamesWithUsersOwnAlias([place1.json.result, place2.json.result], config_places_id_list)
    expect(res[0].alias).toBe('Hello World')
    expect(res[1].alias).toBeUndefined()
  })

  test('does not throw when a place is missing from the result', () => {
    expect(() => replacePlaceNamesWithUsersOwnAlias([undefined], [['missing', 'Alias']])).not.toThrow()
  })

  test('getPlaceId handles both config forms', () => {
    expect(config_places_id_list.map(getPlaceId)).toEqual(['ChIJs4cQo1ydX0YRkoCF1aFt_YA', 'uber-id'])
  })
})
