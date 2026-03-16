type EnrichedFlightsFile = {
  flights?: Array<{
    id?: string | number
    cs?: string
    orig?: string
    dest?: string
    reg?: string
    type?: string
    air?: string
    olat: number
    olon: number
    dlat: number
    dlon: number
    path?: Array<[number, number]>
    segs?: Array<{
      country?: string
      enter?: string
      exit?: string
    }>
    snap_lat?: number
    snap_lon?: number
    snap_alt?: number
  }>
  airports?: Record<string, {
    code?: string
    icao?: string
    iata?: string
    name?: string
    lat?: number
    lon?: number
    elev?: number
    city?: string
    kind?: string
    country?: string
  }>
  country_stats?: Record<string, {
    in_air?: number
    arr?: number
    dep?: number
    dom?: number
    over?: number
    day_total?: number
    day_arr?: number
    day_dep?: number
    day_dom?: number
    day_over?: number
  }>
}

type InMsg = {
  text: string
  routeCountLimit: number | null
}

self.onmessage = (event: MessageEvent<InMsg>) => {
  try {
    const parsed = JSON.parse(event.data.text) as EnrichedFlightsFile
    const flightsSource = Array.isArray(parsed?.flights) ? parsed.flights : []
    const limit = Number.isFinite(event.data.routeCountLimit)
      ? Math.max(1, Math.floor(event.data.routeCountLimit as number))
      : null
    const flights = limit && flightsSource.length > limit
      ? flightsSource.slice(0, limit)
      : flightsSource

    ;(self as any).postMessage({
      flights,
      airports: parsed?.airports && typeof parsed.airports === 'object' ? parsed.airports : null,
      countryStats:
        parsed?.country_stats && typeof parsed.country_stats === 'object'
          ? parsed.country_stats
          : null
    })
  } catch (error) {
    ;(self as any).postMessage({
      error: error instanceof Error ? error.message : 'Failed to parse enriched flights payload'
    })
  }
}
