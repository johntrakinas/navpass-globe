# NAVPASS Globe — Deployment & Parameter Reference

Complete guide for building, hosting, iframe embedding, and configuring the NAVPASS Globe.

---

## 1. Build

```bash
npm install
npm run build
```

Output is generated in `dist/`.

---

## 2. Host `dist/`

Deploy `dist/` to any static host:

- Cloudflare Pages
- Vercel (static)
- Netlify
- S3 + CloudFront

If serving under a subpath, pass the base at build time:

```bash
vite build --base=/globe/
```

---

## 3. Required assets

The built app expects these files to be served alongside it:

```
data/ne_110m_admin_0_countries.geojson
data/airports.json
data/airports_points.json
data/flights_enriched.json
flags/*.svg
```

---

## 4. Webflow iframe embed

```html
<iframe
  src="https://your-globe-domain.example"
  title="NAVPASS Globe"
  loading="lazy"
  style="width:100%;height:100vh;border:0;display:block;"
  allow="fullscreen"
></iframe>
```

Append any of the params below to the URL to configure the globe:

```
https://your-globe-domain.example/?bgColor=0A1628&accentColor=00B4FF&showSelectBacking=0
```

---

## 5. Parent-frame events

When loaded in an iframe, the app posts messages to `window.parent`:

| Event | When |
|---|---|
| `boot` | Immediately on script execution |
| `ready` | Globe fully initialized and rendered |
| `error` | Initialization failed |

Message shape:

```json
{ "source": "navpass-globe", "event": "ready" }
```

---

## 6. URL Parameters

All parameters are optional. Boolean values accept `0`/`1` or `false`/`true`.

---

### General

| Parameter | Type | Default | Description |
|---|---|---|---|
| `assetBaseUrl` | string | Vite BASE_URL | Base URL prefix for all data files. Use when serving from a subdirectory or CDN. |
| `heatmap` | 0\|1 | `0` | Show the flight density heatmap overlay on startup. |
| `flightMode` | `legacy`\|`reengineered` | `reengineered` | Flight rendering pipeline. `reengineered` uses GPU-accelerated arcs with animated planes. `legacy` uses simpler line arcs. |
| `introAnimation` | 0\|1 | `1` | Play the globe spin-in intro animation on load. |

---

### Data files

| Parameter | Type | Default | Description |
|---|---|---|---|
| `routesDataFile` | string | `flights_enriched.json` | Override the enriched flight routes file loaded from `data/`. |
| `airportsDataFile` | string | — | Override the airports file. Takes precedence over `useFullAirportsDataset`. |
| `useFullAirportsDataset` | 0\|1 | `1` | `1` loads `airports.json` (55 000+ airports). `0` loads the legacy `airports_points.json` (~530 airports). |
| `airportRenderLimit` | number | unlimited | Cap the number of airport dots rendered. Per-country count aggregation always uses the full dataset. |
| `airportKinds` | string | `large_airport,medium_airport,small_airport` | Comma-separated list of airport `kind` values to include in both rendering and country aggregation. Valid values: `large_airport`, `medium_airport`, `small_airport`, `heliport`, `closed`, `balloonport`. |

---

### Flight density

| Parameter | Type | Default | Description |
|---|---|---|---|
| `routeCount` | number | `180` | Maximum number of flight route arcs drawn on the globe. |
| `planesPerRoute` | number | engine default | Number of animated plane dots per route arc. |
| `planeDensityScale` | number | `1.0` | Multiplier for overall plane density. `0.1` = sparse, `2.0` = dense. |

---

### Camera & zoom

| Parameter | Type | Default | Description |
|---|---|---|---|
| `minZoomDistance` | number | `14` | Minimum camera distance from the globe centre (closest zoom). Clamped to `[12, 28]`. |
| `maxZoomDistance` | number | `28` | Maximum camera distance (furthest zoom). Clamped to `[minZoom+2, 60]`. |
| `countryClickZoomLevel` | number | auto | Fixed camera distance to animate to when a country is clicked. Omit for smart zoom based on country size. |
| `countryClickZoomDuration` | ms | `1120` | Duration of the country-click zoom animation. Clamped to `[120, 8000]`. |
| `disableScrollZoom` | 0\|1 | `0` | Prevent mouse wheel / trackpad zooming. Alias: `disableScroll`. |
| `scrollResetsView` | 0\|1 | `1` | When `1`, scrolling while a card is open closes the card and resets the camera after a 250 ms debounce. |

---

### UI controls

| Parameter | Type | Default | Description |
|---|---|---|---|
| `showZoomControls` | 0\|1 | `0` | Show + / − zoom buttons. When `0` the buttons are removed from the DOM entirely. |
| `showBreadcrumbs` | 0\|1 | `1` | Show the navigation breadcrumb trail (Home › Map › Country). |
| `breadcrumbOffsetLeft` | px | `50` | Horizontal distance from the viewport left edge to the breadcrumbs. |
| `breadcrumbOffsetTop` | px | `92` | Vertical distance from the viewport top edge to the breadcrumbs. |
| `showCountryCardCloseButton` | 0\|1 | `1` | Show the × close button on the country card. When `0` the card can still be closed by clicking elsewhere or scrolling. |
| `animatedCards` | 0\|1 | component default | Enable animated entrance/exit transitions on info cards. |
| `disableMapInteraction` | 0\|1 | `0` | Disable all click/drag interaction. Hover still works. Useful for decorative or read-only embeds. |
| `searchBarX` | number | — | Custom X offset for the country search bar. |
| `searchBarY` | number | — | Custom Y offset for the country search bar. |
| `showSearchBarMobile` | 0\|1 | breakpoint | Force the search bar visible on mobile viewports. |

---

### Card & UI theming

| Parameter | Type | Default | Description |
|---|---|---|---|
| `accentColor` | hex | `#ECB200` | Color of UI accent elements: live-status dot on the country card, active breadcrumb label, card hover border. |
| `cardBackground` | CSS color | `#0d1c30` | Background of the country card panel. Accepts any CSS color: `#hex`, `rgb()`, `rgba()`, `transparent`. |
| `cardBorderColor` | hex \| rgba | `rgba(255,255,255,0.08)` | Outer border color of the country card. |
| `cardBorderWidth` | px | `1` | Width of the country card border. `0` removes it entirely. |
| `showSelectBacking` | 0\|1 | `1` | Show the thick shadow backing on the selected country border line. Set to `0` for a minimal look. |

---

### Directional lighting

| Parameter | Type | Default | Description |
|---|---|---|---|
| `lightIntensity` | 0–2 | `0` (off) | Enables a soft directional light on the globe surface. Range `0.3–0.8` for a subtle glow. Values above `1.0` produce a strong specular-like highlight. |
| `lightColor` | hex | theme `lighting.day` | Tint of the illuminated face of the globe. |
| `lightRadius` | 0.01–1.0 | `0.35` | Half-intensity radius of the light blob. `0.05` = tight spotlight, `0.35` = medium blob, `0.8` = near-full-globe wash. |
| `lightX` | number | camera-facing | X component of the light direction vector in world space. |
| `lightY` | number | camera-facing | Y component of the light direction vector in world space. |
| `lightZ` | number | camera-facing | Z component of the light direction vector in world space. |

---

### Globe theming — quick color shortcuts

Convenience params that map directly to theme slots. For full control use `theme=` or `theme.*` dot params.

| Parameter | Maps to | Default | Description |
|---|---|---|---|
| `bgColor` | `scene.background`, `scene.depthMask`, `scene.innerSphere` | `#091320` | Space / background color behind the globe. |
| `gridMainColor` | `grids.triColor`, `grids.latLonColor` | `#B8C0CE` | Color of lat/lon and triangular grid lines. |
| `gridEffectColor` | `grids.triShimmerColor`, `grids.latLonShimmerColor` | `#B8C0CE` | Color of the shimmer/pulse effect on grid lines. |
| `countryLineColor` | `countries.border` | `#4796FF` | Color of country border lines drawn on the globe surface. |
| `hoverColor` | `highlights.hoverA`, `highlights.hoverB`, `highlights.hoverCore` | `#FBBC05` | Base color of the country hover highlight line. |
| `hoverAccentColor` | `highlights.hoverB` | `#FBBC05` | Secondary/accent color for the hover highlight outer glow. |
| `hoverCoreColor` | `highlights.hoverCore` | `#FBBC05` | Color of the sharp inner core of the hover line. |
| `hoverPaletteMix` | `highlights.hoverPaletteMix` | `0.0` | Blend between primary and accent hover colors. `0` = full primary, `1` = full accent. |
| `selectedColor` | `highlights.selectedA`, `highlights.selectedC` | `#ffffff` | Base color of the selected-country border highlight. |
| `selectedAccentColor` | `highlights.selectedB`, `highlights.selectedD` | `#FBBC05` | Accent color for the animated selected border effect. |
| `planeCoreColor` | `flights.planeCoreColor` | — | Core color of animated plane dots. |
| `planeGlowColor` | `flights.planeGlowColor` | — | Glow color of animated plane dots. |
| `planeTintColor` | `flights.planeTintColor` | `#FBBC05` | Tint color of animated plane dots. |
| `planeAccentColor` | `flights.planeAccentColor` | `#ffffff` | Accent color of animated plane dots. |
| `airportDotColor` | `points.dotColorMul` | `#FBBC05` | Color multiplier for airport dot points. Aliases: `airportPulseColor`, `airportColor`. |
| `glowColor` | `atmosphere.glowColor` | `#ffffff` (neutral) | Multiplicative tint applied to all atmosphere glow layers at once. |

---

### Globe theming — full JSON

Pass a full `GlobeTheme` object as a URL-encoded JSON string:

```
?theme=<URL-encoded JSON>
```

Or override individual slots with dot-notation:

```
?theme.atmosphere.glowColor=%23FF6B35
?theme.highlights.hoverA=%23ffffff&theme.highlights.hoverB=%23FBBC05
?theme.scene.background=%2307090d
```

Dot-notation params have the highest priority and override both `theme=` JSON and shortcut params.

**Full theme structure:**

```ts
{
  scene: {
    background: ColorRepresentation,      // space/background color
    depthMask: ColorRepresentation,
    innerSphere: ColorRepresentation
  },
  countries: {
    border: ColorRepresentation           // country border lines on globe
  },
  grids: {
    triColor: ColorRepresentation,
    triShimmerColor: ColorRepresentation,
    latLonColor: ColorRepresentation,
    latLonShimmerColor: ColorRepresentation
  },
  landWater: {
    landTint: ColorRepresentation,
    coastTint: ColorRepresentation
  },
  atmosphere: {
    innerCore: ColorRepresentation,
    innerRim: ColorRepresentation,
    outerCore: ColorRepresentation,
    outerRim: ColorRepresentation,
    subsurfaceCore: ColorRepresentation,
    subsurfaceRim: ColorRepresentation,
    glowColor?: ColorRepresentation       // runtime-updatable via setGlowColor()
  },
  lighting: {
    shadow: ColorRepresentation,
    day: ColorRepresentation
  },
  points: {
    dotColorMul: ColorRepresentation,
    dotFlowColor: ColorRepresentation,
    nightWarmA: ColorRepresentation,
    nightWarmB: ColorRepresentation
  },
  flights: {
    lineBaseColor: ColorRepresentation,
    lineHeadColor: ColorRepresentation,
    lineTailColor: ColorRepresentation,
    lineAccentColor: ColorRepresentation,
    planeCoreColor: ColorRepresentation,
    planeGlowColor: ColorRepresentation,
    planeTintColor: ColorRepresentation,
    planeAccentColor: ColorRepresentation,
    heatColdColor: ColorRepresentation,
    heatMidColor: ColorRepresentation,
    heatHotColor: ColorRepresentation,
    heatEdgeAccentColor: ColorRepresentation,
    endpointOriginColor: ColorRepresentation,
    endpointDestColor: ColorRepresentation,
    endpointAccentColor: ColorRepresentation,
    pinHoverColor: ColorRepresentation,
    pinSelectedColor: ColorRepresentation,
    hubColorMul: ColorRepresentation
  },
  highlights: {
    hoverA: ColorRepresentation,          // hover line primary color
    hoverB: ColorRepresentation,          // hover line accent color
    hoverCore: ColorRepresentation,       // hover sharp core color
    hoverPaletteMix: number,              // 0–1 palette blend
    selectedA: ColorRepresentation,       // selected border color A (white)
    selectedB: ColorRepresentation,       // selected border color B (gold accent)
    selectedC: ColorRepresentation,
    selectedD: ColorRepresentation
  }
}
```

---

## 7. JavaScript API

When importing the globe as a module:

```ts
import { globe } from '@bytenana/globe'

const app = globe({
  mountTarget: document.getElementById('app'),
  bgColor: '#0A1628',
  accentColor: '#00B4FF',
  showSelectBacking: true,
  cardBackground: 'rgba(10, 20, 40, 0.85)',
  airportKinds: ['large_airport', 'medium_airport'],
  scrollResetsView: true,
  theme: {
    atmosphere: { glowColor: '#8AB4F8' }
  }
})

await app.ready

// Update atmosphere glow color at runtime
app.setGlowColor('#FF9F40')  // amber glow
app.setGlowColor('#ffffff')  // reset to neutral
```

### `GlobeInstance`

| Method | Description |
|---|---|
| `ready` | `Promise<void>` — resolves when the globe is fully initialized. |
| `setGlowColor(color)` | Update the atmosphere glow tint at runtime. `#ffffff` resets to neutral. |

---

## 8. Example configurations

### Minimal dark embed
```
?bgColor=070A10&showZoomControls=0&showBreadcrumbs=0&introAnimation=0
```

### Custom branded colors
```
?bgColor=0A1628&accentColor=00B4FF&countryLineColor=1A6FFF&glowColor=4488FF&cardBackground=rgba(5,15,35,0.9)
```

### Performance — reduce airports and flights
```
?airportKinds=large_airport&airportRenderLimit=500&routeCount=60
```

### Lighting effect
```
?lightIntensity=0.6&lightRadius=0.4&lightColor=8AB4F8
```

### Read-only decorative embed
```
?disableMapInteraction=1&showZoomControls=0&showBreadcrumbs=0&introAnimation=0&scrollResetsView=0
```

### No shadow backing on selected country
```
?showSelectBacking=0
```
