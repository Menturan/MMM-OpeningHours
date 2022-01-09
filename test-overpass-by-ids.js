const OverpassFrontend = require('overpass-frontend')
const opening_hours = require("opening_hours");

// you may specify an OSM file as url, e.g. 'test/data.osm.bz2'
const overpassFrontend = new OverpassFrontend('//overpass-api.de/api/interpreter')

function formatResults (err, result) {
    if (result) {
        var oh = new opening_hours(result.tags.opening_hours, {address: {country_code: 'fr', state: "Pays de la Loire"}});
        var date = new Date();
        var is_open = oh.getState(date);
        var next_change = oh.getNextChange()
        console.log('* ' + result.tags.name + ' (is_open: ' + is_open + ' next_change: '+ next_change +')');
    } else {
      console.log('* empty result')
    }
  }

// request restaurants in the specified bounding box
overpassFrontend.get(
  ['n311423696', 'n8661321105', "w82532728"],
  {
    properties: OverpassFrontend.TAGS
  },
  formatResults,
  function (err) {
    if (err) { console.log(err) }
  }
)