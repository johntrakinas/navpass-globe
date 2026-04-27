# Globe — URL Params Cheat Sheet

Append any of these to the iframe `src` URL. All params are optional.

```
https://…/globe/?bgColor=0A1628&accentColor=ECB200&routeCount=120&showSelectBacking=1
```

---

## General

| Param | Default | Values | Example |
|---|---|---|---|
| `introAnimation` | `1` | `0\|1` | `introAnimation=0` — skip the startup spin |
| `heatmap` | `0` | `0\|1` | `heatmap=1` — show flight density heatmap overlay |
| `flightMode` | `reengineered` | `legacy\|reengineered` | `flightMode=legacy` |
| `assetBaseUrl` | Vite BASE_URL | string | `assetBaseUrl=/cdn/globe/` — CDN or subpath prefix for assets |

---

## Data

| Param | Default | Values | Example |
|---|---|---|---|
| `airportKinds` | `large_airport,medium_airport` | comma-separated list | `airportKinds=large_airport,medium_airport,small_airport` |
| `airportRenderLimit` | unlimited | number | `airportRenderLimit=500` — cap rendered airport dots |
| `useFullAirportsDataset` | `1` | `0\|1` | `useFullAirportsDataset=0` — use legacy ~530 entry dataset |
| `airportsDataFile` | — | filename | `airportsDataFile=my_airports.json` — overrides `useFullAirportsDataset` |
| `routesDataFile` | `flights_enriched.json` | filename | `routesDataFile=custom_flights.json` |

**`airportKinds` accepted values:** `large_airport`, `medium_airport`, `small_airport`, `heliport`, `closed`, `balloonport`

---

## Flights

| Param | Default | Values | Example |
|---|---|---|---|
| `routeCount` | `180` | number | `routeCount=80` — fewer arcs for cleaner look |
| `planesPerRoute` | auto | number | `planesPerRoute=3` — fix planes per arc |
| `planeDensityScale` | `1.0` | `0.1–2.0` | `planeDensityScale=0.5` — sparse; `planeDensityScale=1.8` — dense |

---

## Camera

| Param | Default | Values | Example |
|---|---|---|---|
| `minZoomDistance` | `14` | `12–28` | `minZoomDistance=16` — prevent zooming in too close |
| `maxZoomDistance` | `28` | `min+2 – 60` | `maxZoomDistance=40` — allow wider pull-back |
| `countryClickZoomLevel` | auto | number | `countryClickZoomLevel=18` — zoom distance after clicking a country |
| `countryClickZoomDuration` | `1120` | `120–8000` ms | `countryClickZoomDuration=600` — faster zoom |
| `disableScrollZoom` | `0` | `0\|1` | `disableScrollZoom=1` — lock zoom; alias: `disableScroll` |
| `scrollResetsView` | `1` | `0\|1` | `scrollResetsView=0` — scroll does not close the country card |

---

## UI

| Param | Default | Values | Example |
|---|---|---|---|
| `showZoomControls` | `0` | `0\|1` | `showZoomControls=1` — show +/− buttons |
| `showBreadcrumbs` | `1` | `0\|1` | `showBreadcrumbs=0` — hide breadcrumb trail |
| `breadcrumbOffsetLeft` | `50` | px | `breadcrumbOffsetLeft=20` |
| `breadcrumbOffsetTop` | `92` | px | `breadcrumbOffsetTop=60` |
| `showCountryCardCloseButton` | `1` | `0\|1` | `showCountryCardCloseButton=0` — hide × button on card |
| `heroLayout` | `shifted` | `shifted\|centered` | `heroLayout=centered` — keep globe centered with full-stats card bottom-right (legacy). Default slides globe right and shows a compact name-only card bottom-left. |
| `heroShiftPercent` | `12` | `0–50` (% of viewport width) | `heroShiftPercent=18` — slide globe further right on country click. Only applies when `heroLayout=shifted`. `0` disables the shift while keeping the compact card. |
| `animatedCards` | auto | `0\|1` | `animatedCards=0` — disable card slide-in animation |
| `disableMapInteraction` | `0` | `0\|1` | `disableMapInteraction=1` — block clicks and drags (hover still works) |
| `showSearchBarMobile` | breakpoint | `0\|1` | `showSearchBarMobile=1` — force show search on mobile |
| `searchBarX` | — | px | `searchBarX=24` — left offset of the search bar |
| `searchBarY` | — | px | `searchBarY=16` — top offset of the search bar |

---

## Card & Theming

| Param | Default | Example | Notes |
|---|---|---|---|
| `accentColor` | `ECB200` | `accentColor=00B4FF` | Gold accent: live dot, breadcrumb, card border glow. **No `#` prefix.** |
| `cardBackground` | `#0d1c30` | `cardBackground=transparent` | CSS background for the card panel. Accepts any CSS color or `transparent`. |
| `cardBackgroundColor` | `#001E3D` | `cardBackgroundColor=0d1c30` | Solid color applied to all card sections. Takes precedence over `cardBackground`. |
| `cardBorderColor` | `rgba(255,255,255,0.08)` | `cardBorderColor=rgba(255,255,255,0.2)` | Accepts hex or `rgba(…)`. |
| `cardBorderWidth` | `1` | `cardBorderWidth=0` | px. `0` removes the border entirely. |
| `showSelectBacking` | `0` | `showSelectBacking=1` | Thick dark shadow behind selected country border. |
| `showCountryGlow` | `0` | `showCountryGlow=1` | Soft halo glow around selected country border. |
| `highlightRenderMode` | `line2` | `line\|line2` | Renderer for hover/select border line. `line2` = Line2 + LineMaterial (thick, smooth). `line` = THREE.LineLoop (1px, classic WebGL). |

---

## Lighting

| Param | Default | Values | Example |
|---|---|---|---|
| `lightIntensity` | `0` (off) | `0–2` | `lightIntensity=0.5` — subtle directional glow |
| `lightColor` | theme day color | hex (no `#`) | `lightColor=FF9F40` — amber tint |
| `lightRadius` | `0.35` | `0.01–1.0` | `lightRadius=0.05` — tight spotlight; `lightRadius=0.8` — broad wash |
| `lightX` | camera-facing | number | `lightX=1&lightY=0.5&lightZ=0` — world-space direction vector |
| `lightY` | camera-facing | number | |
| `lightZ` | camera-facing | number | |

---

## Globe Colors (shortcuts)

These override the matching `theme.*` values. All color values are hex **without** `#`.

| Param | Default | Example | What it controls |
|---|---|---|---|
| `bgColor` | `091320` | `bgColor=000000` | Background, depth mask, inner sphere |
| `countryLineColor` | `4796FF` | `countryLineColor=FFFFFF` | Country border lines |
| `gridMainColor` | `B8C0CE` | `gridMainColor=334466` | Grid line base color |
| `gridEffectColor` | `B8C0CE` | `gridEffectColor=00FFFF` | Grid shimmer/effect color |
| `glowColor` | `ffffff` (neutral) | `glowColor=5599FF` | Atmosphere glow tint. White = no tint. |
| `hoverColor` | `FBBC05` | `hoverColor=FFFFFF` | Sets hoverA, hoverB, hoverCore all at once |
| `hoverAccentColor` | `FBBC05` | `hoverAccentColor=00FFAA` | Overrides only hoverB (accent part of hover palette) |
| `hoverCoreColor` | `FBBC05` | `hoverCoreColor=FFFFFF` | Overrides only hoverCore |
| `hoverPaletteMix` | `0.0` | `hoverPaletteMix=0.5` | `0–1` blend between hover palette extremes |
| `selectedColor` | `ffffff` | `selectedColor=ECB200` | Sets all four selected palette slots at once |
| `selectedAccentColor` | `FBBC05` | `selectedAccentColor=ECB200` | Overrides selectedB and selectedD only |
| `airportDotColor` | `FBBC05` | `airportDotColor=00B4FF` | Airport dot and pulse color. Aliases: `airportColor`, `airportPulseColor` |
| `planeCoreColor` | — | `planeCoreColor=FFFFFF` | Plane body color |
| `planeGlowColor` | — | `planeGlowColor=4796FF` | Plane glow/bloom |
| `planeTintColor` | — | `planeTintColor=FF9900` | Plane route arc tint |
| `planeAccentColor` | — | `planeAccentColor=ECB200` | Plane accent highlight |

---

## Advanced: theme dot-params

Pass nested theme values directly without JSON encoding:

```
?theme.atmosphere.glowColor=FF5500&theme.highlights.hoverPaletteMix=0.4
```

Follows the `GlobeTheme` object structure. Valid paths include:

| Path | Example |
|---|---|
| `theme.scene.background` | `theme.scene.background=0A1628` |
| `theme.countries.border` | `theme.countries.border=4796FF` |
| `theme.grids.triColor` | `theme.grids.triColor=334466` |
| `theme.atmosphere.glowColor` | `theme.atmosphere.glowColor=5599FF` |
| `theme.highlights.hoverPaletteMix` | `theme.highlights.hoverPaletteMix=0.3` |
| `theme.flights.planeCoreColor` | `theme.flights.planeCoreColor=FFFFFF` |

---

## Full example URL

```
?bgColor=091320
&accentColor=ECB200
&countryLineColor=4796FF
&glowColor=4796FF
&routeCount=120
&planeDensityScale=1.2
&minZoomDistance=15
&maxZoomDistance=35
&showBreadcrumbs=1
&showZoomControls=0
&showSelectBacking=1
&cardBorderColor=rgba(255,255,255,0.12)
&cardBackground=transparent
&lightIntensity=0.4
&lightRadius=0.4
```
