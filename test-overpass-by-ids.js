const OverpassFrontend = require('overpass-frontend')
const opening_hours = require("opening_hours");

// you may specify an OSM file as url, e.g. 'test/data.osm.bz2'
const overpassFrontend = new OverpassFrontend('//overpass-api.de/api/interpreter')
var r = 'n/a';
function formatResults (err, result) {
    if (result) {
        // TODO configure country_code and state
        var oh = new opening_hours(result.tags.opening_hours, {address: {country_code: 'fr', state: "Pays de la Loire"}});
        var date = new Date();
        var is_open = oh.getState(date);
        var next_change = oh.getNextChange()
        console.log('* ' + result.tags.name + ' (is_open: ' + is_open + ' next_change: '+ next_change +')');
        r = result;
    } else {
      console.log('* empty result')
    }
  }

overpassFrontend.get(
  // USER : insert your identifiers from test-overpass.js here
  ['n311423696', 'n8661321105', "w82532728"],
  {
    properties: OverpassFrontend.TAGS
  },
  formatResults,
  function (err) {
    if (err) { console.log(err) }
  }
)
console.log(r)