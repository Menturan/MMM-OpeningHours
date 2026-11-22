const fs = require('fs')
const path = require('path')

function getPlaceFromFile (filePath) {
  const content = fs.readFileSync(path.resolve(__dirname, filePath), 'utf8')
  return { json: JSON.parse(content) }
}

module.exports = { getPlaceFromFile }
