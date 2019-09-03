function replacePlaceNamesWithUsersOwnAlias(result, places) {
    places.forEach((place) => {
        if (Array.isArray(place)) {
            const placeId = place[0];
            const placeName = place[1];
            let placeToGiveAlias = result.find(function (p) {
                return placeId === p["place_id"];
            });
            placeToGiveAlias["alias"] = placeName
        }
    });
    return result;
}

let isServerSide = true;

try {
    const dummy = window !== undefined;
    isServerSide = false
} catch (e) {
    // Do nothing...
}

if (isServerSide) {
    module.exports = {replacePlaceNamesWithUsersOwnAlias};
}
