/*
 * Google Places API clients (server side only).
 *
 * Both clients return places in one internal shape, which is the shape of the
 * legacy Place Details result. The frontend and the opening hours logic only
 * ever see this shape:
 *
 *   {
 *     place_id: 'ChIJ...',
 *     name: 'Some store',
 *     utc_offset_minutes: 60,     // undefined if Google did not return it
 *     opening_hours: {            // undefined if Google has no hours
 *       periods: [{ open: { day: 0-6, time: 'HHmm', date? }, close: { day, time, date? } }]
 *     }
 *   }
 *
 * `day` is 0 = Sunday ... 6 = Saturday, in both API versions. `date` ('YYYY-MM-DD')
 * is only set for currentOpeningHours from Places API (New), where each period
 * belongs to a specific date.
 */

const PLACES_NEW_URL = 'https://places.googleapis.com/v1/places/'
const PLACES_LEGACY_URL = 'https://maps.googleapis.com/maps/api/place/details/json'

/*
 * Field mask for Place Details (New).
 *
 * The field mask decides what Google bills for. A request is billed at the
 * highest SKU of any field in the mask, so keep this list as short as possible.
 *   - id                   -> Place Details Essentials (IDs Only)
 *   - displayName          -> Place Details Pro
 *   - utcOffsetMinutes     -> Place Details Pro
 *   - currentOpeningHours  -> Place Details Enterprise
 *   - regularOpeningHours  -> Place Details Enterprise
 * The opening hours fields put every request in the Enterprise SKU. Since that
 * SKU is unavoidable for this module, requesting both hours fields costs the
 * same as requesting one. Do not add fields that are not rendered.
 */
const PLACES_NEW_FIELD_MASK = 'id,displayName,utcOffsetMinutes,currentOpeningHours,regularOpeningHours'

// Legacy equivalent. 'opening_hours' is a Contact Data field in the legacy billing
// model; 'utc_offset' is a Basic Data field and adds no charge.
const PLACES_LEGACY_FIELDS = 'name,opening_hours,place_id,utc_offset'

// A request that takes longer than this is aborted and counted as failed (and retried).
const FETCH_TIMEOUT_MS = 15000

const offsetOrUndefined = value => typeof value === 'number' ? value : undefined

function pad2 (n) {
  return String(n).padStart(2, '0')
}

function pointToLegacy (point) {
  if (!point) return undefined
  const res = { day: point.day, time: pad2(point.hour || 0) + pad2(point.minute || 0) }
  if (point.date && point.date.year) {
    res.date = point.date.year + '-' + pad2(point.date.month) + '-' + pad2(point.date.day)
  }
  return res
}

function isAlwaysOpenPeriods (periods) {
  return periods.length === 1 && periods[0].close === undefined &&
    periods[0].open.day === 0 && (periods[0].open.hour || 0) === 0 && (periods[0].open.minute || 0) === 0
}

/*
 * Convert a Place Details (New) response to the internal shape.
 *
 * currentOpeningHours covers the next seven days, including holidays and other
 * special hours, so it is preferred. regularOpeningHours is the fallback, and is
 * also used when it says "open 24/7", which is its documented 24/7 encoding.
 */
function normalizePlaceNew (place) {
  const usable = h => h && Array.isArray(h.periods) && h.periods.length > 0
  const regular = usable(place.regularOpeningHours) ? place.regularOpeningHours : undefined
  const current = usable(place.currentOpeningHours) ? place.currentOpeningHours : undefined
  const hours = regular && isAlwaysOpenPeriods(regular.periods) ? regular : (current || regular)

  return {
    place_id: place.id,
    name: place.displayName ? place.displayName.text : place.id,
    utc_offset_minutes: offsetOrUndefined(place.utcOffsetMinutes),
    opening_hours: hours === undefined
      ? undefined
      : {
          periods: hours.periods.map(p => ({
            open: pointToLegacy(p.open),
            close: pointToLegacy(p.close)
          }))
        }
  }
}

function normalizePlaceLegacy (result) {
  return {
    place_id: result.place_id,
    name: result.name,
    utc_offset_minutes: offsetOrUndefined(result.utc_offset_minutes !== undefined ? result.utc_offset_minutes : result.utc_offset),
    opening_hours: result.opening_hours && Array.isArray(result.opening_hours.periods) &&
      result.opening_hours.periods.length > 0
      ? { periods: result.opening_hours.periods }
      : undefined
  }
}

async function fetchPlaceNew (placeId, apiKey, language, fetchImpl = fetch) {
  const url = PLACES_NEW_URL + encodeURIComponent(placeId) +
    (language ? '?languageCode=' + encodeURIComponent(language) : '')
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_NEW_FIELD_MASK
    }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body.error && body.error.message ? body.error.message : response.statusText
    throw new Error('Places API (New) ' + response.status + ': ' + message)
  }
  return normalizePlaceNew(body)
}

async function fetchPlaceLegacy (placeId, apiKey, language, fetchImpl = fetch) {
  const params = new URLSearchParams({ place_id: placeId, fields: PLACES_LEGACY_FIELDS, key: apiKey })
  if (language) params.set('language', language)
  const response = await fetchImpl(PLACES_LEGACY_URL + '?' + params.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.status !== 'OK') {
    throw new Error('Places API (Legacy) ' + (body.status || response.status) +
      (body.error_message ? ': ' + body.error_message : ''))
  }
  return normalizePlaceLegacy(body.result)
}

module.exports = {
  PLACES_NEW_FIELD_MASK,
  FETCH_TIMEOUT_MS,
  normalizePlaceNew,
  normalizePlaceLegacy,
  fetchPlaceNew,
  fetchPlaceLegacy
}
