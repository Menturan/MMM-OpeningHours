# MMM-OpeningHours - WIP
**Note! This module is still under development! 
Things such as configurations and appearance may change. Use at your own risk!**

Magic Mirror module that displays opening hours of places.
 Relys on [Google Places API](https://developers.google.com/places/web-service/intro).

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

[Place ID Finder](https://google-developers.appspot.com/maps/documentation/javascript/examples/full/places-placeid-finder)

## Configuration

| Key | Value | Required | Default | Description | 
|-----|-------|---------|---------|---------|
|debug|_boolean_| N| false| Debug output. |

## Example config

```json
{
    module: "MMM-OpeningHours",
    position: "bottom_right",
    config: {
        googleApiKey: undefined,
        stores: [],
        scheduleTime: 60000 * 60 * 24,
        timeFormat: config.timeFormat,
        language: config.language,
        styling: {
          size: 'small', // xsmall, small (default) , medium. large, xlarge
          showHeader: true,
          showTimeUntil: true
        },
        debug: true
      }
}
```
## Development
This module isn't perfect. If you find a bug or has a feature request don't hesitate to create an issue OR even better, create a pull request! :D

