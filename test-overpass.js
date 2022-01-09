const OverpassFrontend = require('overpass-frontend')

// you may specify an OSM file as url, e.g. 'test/data.osm.bz2'
const overpassFrontend = new OverpassFrontend('//overpass-api.de/api/interpreter')
// request restaurants in the specified bounding box
console.log('openstreetmap: {')
console.log('   places: [')
overpassFrontend.BBoxQuery(
  'nwr[opening_hours]',
  // TODO - which location should be used for the example ?
  {  minlat: 47.252562658480834, minlon:-1.5286446541310434, maxlat:47.257594550572655,maxlon:-1.5083456963063904},

  {
    properties: OverpassFrontend.ALL
  },
  function (err, result) {
    console.log('["' + result.id + '", "' + result.tags.name + '"],')
  },
  function (err) {
    if (err) { console.log(err) }
  }
)
