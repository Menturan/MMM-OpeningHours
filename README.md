# MMM-OpeningHours - WIP

[![Known Vulnerabilities](https://snyk.io/test/github/Menturan/MMM-OpeningHours/badge.svg)](https://snyk.io/test/github/Menturan/MMM-OpeningHours)
[![LGTM Alerts](https://img.shields.io/lgtm/alerts/g/Menturan/MMM-OpeningHours.svg?style=flat-square)](https://lgtm.com/projects/g/Menturan/MMM-OpeningHours/alerts?mode=list)
[![LGTM Grade](https://img.shields.io/lgtm/grade/javascript/g/Menturan/MMM-OpeningHours.svg?style=flat-square)](https://lgtm.com/projects/g/Menturan/MMM-OpeningHours/)
[![Yarn](https://img.shields.io/badge/dependency%20manager-Yarn-blue.svg?style=flat-square)](https://yarnpkg.com)

[![Say Thanks!](https://img.shields.io/badge/Say%20Thanks-!-1EAEDB.svg?style=flat-square)](https://saythanks.io/to/Menturan)
![Maintenance](https://img.shields.io/maintenance/yes/2022.svg?style=flat-square)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/m/Menturan/MMM-OpeningHours.svg?style=flat-square)](https://github.com/Menturan/MMM-OpeningHours/graphs/commit-activity)
[![GitHub License](https://img.shields.io/github/license/Menturan/MMM-OpeningHours.svg?style=flat-square)](https://github.com/Menturan/MMM-OpeningHours/blob/master/LICENSE)


**Note! This module is still under development!
Things such as configurations and appearance may change. Use at your own risk!**

Magic Mirror module that displays places opening hours.
Relies on [Google Places API](https://developers.google.com/places/web-service/intro).

## Screenshot
![Screenshot](screenshot.png)

## Prerequisite

You need to have a Google Places API key to use this module.
Follow their guide here: [Get API Key](https://developers.google.com/places/web-service/get-api-key).

**NOTE! The opening hours field in Google Places API is a billed field.
However, Google give you a free monthly credit.
Please carefully read about their billing [here](https://developers.google.com/places/web-service/usage-and-billing).
Contributors of this module is not responsible for any charges.**

## Install
This module uses Yarn.
1. `yarn install`

## Find places ID
Search for the place to get its ID. You really needs to **search** for a place. Clicking on a place wont cut it.

[Place ID Finder](https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder)

## Configuration

| Key          | Value             | Required | Default           | Description                                                                                                                                                                                             |
|--------------|-------------------|----------|-------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| googleApiKey | _string_          | Yes      | N/A               | Your Google Places API Key.                                                                                                                                                                             |
| places       | [See below.](#places-config)        | Yes      | N/A               | List of place ids. [See above.](#find-places-id)                                                                                                                                                        |
| scheduleTime | _milliseconds_    | No       | 86400000 (24h)    | Time between fetching place data from Google.                                                                                                                                                           |
| timeFormat   | _number_          | No       | config.timeFormat | 24h, 12h. If not specified, uses same as parent config.                                                                                                                                                 |
| language     | _ISO 639-1  code_ | No       | config.language   | Changes the translation. Time and date is still locale. Two letter country code. [ISO 639-1 code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes). If not specified, uses same as parent config. |
| styling      | _object_          | No       | See next table.   | Configure table style.
| openstreetmap | _boolean_        | No       | false             | Use OSM opening_hours data via Overpass API
| debug        | _boolean_         | No       | false             | Debug output.                                                                                                                                                                                           |
| mockData     | _boolean_         | No       | false             | Fake API-call. Used for development.                                                                                                                                                                    |

### Places config
Places are provided as a list `[]`. Example - `["place_id_1", "place_id_2", "place_id_3"]`.

If you would like to use an alias for a place you put the place id and the alias in a list with the **place id first**. Example - `["place_id_1", ["place_id_2", "Place 2"], "place_id_3"]`.

When `openstreetmap` is set to `true`, you can list identifiers of the OSM objects, preceded by `n` for nodes, `w` for ways, `r` for relations. To get those
identifiers you can use https://overpass-turbo.eu/?template=key&key=opening_hours or modify the boundingbox and run `node test-overpass.js` (identifiers can then be
tested in `test-overpass-ids.js`).

TODO: generate a configuration from a geopoint finding all `opening_hours` data surrounding it and then filtering the interresting points.

#### Styling

| Key           | Value     | Required | Default | Description                                                           |
|---------------|-----------|----------|---------|-----------------------------------------------------------------------|
| showTimeUntil | _boolean_ | No       | false   | Show time until close/open instead of time when closed/open.          |
| textAlign     | _string_  | No       | center  | Table text alignment. Possible values: left, right, center.           |
| size          | _string_  | No       | small   | Size of table. Possible values: xsmall, small, medium. large, xlarge. |


## Example config

```
{
    module: "MMM-OpeningHours",
    position: "bottom_right",
    header: "Opening hours",
    config: {
        googleApiKey: "XXXXXXXXXXXXXX",
        openstreetmap: false,
        places: ["xxxxxxxx", ["yyyyyyyy", "Alias y"]],
        styling: {
          size: 'small'
        }
    }
}
```
## Development
This module isn't perfect. If you find a bug or has a feature request don't hesitate to create an issue OR even better, create a pull request! :D
