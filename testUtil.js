var fs = require('fs')
const path = require("path");

function getPlaceFromFile(filePath) {
    const file = path.resolve(__dirname, filePath);    
    const content = fs.readFileSync(file, 'utf8');
    return { json: JSON.parse(content) }
}

module.exports = { getPlaceFromFile }