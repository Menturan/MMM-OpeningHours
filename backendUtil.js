/*
 * Config entries are either 'placeId' or ['placeId', 'Alias'].
 */
function getPlaceId (placeConfig) {
  return Array.isArray(placeConfig) ? placeConfig[0] : placeConfig
}

function replacePlaceNamesWithUsersOwnAlias (result, places) {
  places.forEach((place) => {
    if (Array.isArray(place)) {
      const placeId = place[0]
      const placeName = place[1]
      const placeToGiveAlias = result.find(p => p && placeId === p.place_id)
      if (placeToGiveAlias) {
        placeToGiveAlias.alias = placeName
      }
    }
  })
  return result
}

module.exports = { getPlaceId, replacePlaceNamesWithUsersOwnAlias }
