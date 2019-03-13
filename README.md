# MMM-OpeningHours
Magic Mirror module that displays Swedish names of the day. Relys on [Svenska Dagar Api](https://api.dryg.net/).

## Screenshot
![Screenshot](screenshot.png)

## Install
This module uses Yarn.
1. `yarn install`

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
          showHeader: true,
          showTimeUntil: true
        },
        debug: true
      }
}
```
## Development
This module isn't perfect. If you find a bug or has a feature request don't hesitate to create an issue OR even better, create a pull request! :D

