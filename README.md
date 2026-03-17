# NAVPASS Globe

Interactive 3D globe for global flight visualization, built with Three.js and custom shaders.

## Standalone Runtime

This repository is now standalone-first.

- `src/main.ts` is the app bootstrap entry.
- `src/index.ts` contains the core globe runtime.
- `index.html` is the host page rendered inside the deployment target and `iframe`.

## Development

Requirements:
- Node.js 20+
- npm 9+

Install and run:

```bash
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Deploy as Standalone

Build the app:

```bash
npm run build
```

Deploy the `dist/` folder to any static host (Cloudflare Pages, Vercel static output, Netlify, S3+CloudFront, etc).

Important:
- The app loads assets from `data/*` and `flags/*`.
- If you deploy under a subpath, build with a base path:

```bash
vite build --base=/your-subpath/
```

## Embed in Webflow (Iframe)

Add an Embed block and use:

```html
<iframe
  src="https://your-globe-domain.example"
  title="NAVPASS Globe"
  loading="lazy"
  style="width:100%;height:100vh;border:0;display:block;"
  allow="fullscreen"
></iframe>
```

If your globe URL is under a subpath, use that full URL in `src`.

## Runtime Query Params

`src/main.ts` supports URL params for iframe-hosted configuration:

- `assetBaseUrl=/some/path`
- `heatmap=true|false`
- `flightMode=legacy|reengineered`
- `introAnimation=true|false` (default `true`)
- `showBreadcrumbs=true|false` (default `true`)
- `breadcrumbOffsetLeft=60` (optional breadcrumb left offset in px)
- `breadcrumbOffsetTop=92` (optional breadcrumb top offset in px)
- `showZoomControls=true|false` (default `true`)
- `showCountryCardCloseButton=true|false` (default `true`)
- `countryClickZoomLevel=18` (optional fixed camera distance when a country is selected)
- `countryClickZoomDuration=1120` (optional zoom animation duration in ms)
- `disableScrollZoom=true|false`
- `minZoomDistance=17`
- `maxZoomDistance=32`
- `routeCount=300` (how many routes to generate)
- `planesPerRoute=3` (max planes rendered per route)
- `planeDensityScale=0.74` (overall plane density multiplier)
- `bgColor=#091320` (or `0x091320`) for background/globe
- `gridEffectColor=#B8C0CE` (or `0xB8C0CE`) for grid effect color
- `gridMainColor=#B8C0CE` (or `0xB8C0CE`) for main grid color
- `countryLineColor=#4796FF` (or `0x4796FF`) for country border lines
- `hoverColor=#FFFFFF` (or `0xFFFFFF`) for the overall hover color
- `hoverAccentColor=#FBBC05` (or `0xFBBC05`) for the secondary hover tint
- `hoverCoreColor=#FFFFFF` (or `0xFFFFFF`) for the hover core color
- `hoverPaletteMix=0.0..1.0` for animated palette blending on hover
- `planeCoreColor=#FFFFFF` (or `0xFFFFFF`) for plane core
- `planeGlowColor=#FFE082` (or `0xFFE082`) for plane glow
- `planeTintColor=#FBBC05` (or `0xFBBC05`) for plane tint
- `planeAccentColor=#FFFFFF` (or `0xFFFFFF`) for plane accent
- `theme=<JSON url-encoded>`
- `theme.<section>.<token>=<value>`

Example:

```text
https://your-globe-domain.example/?heatmap=true&flightMode=reengineered&showBreadcrumbs=true&showZoomControls=false&showCountryCardCloseButton=false&countryClickZoomLevel=18&minZoomDistance=16&maxZoomDistance=30
```

## Library Options

When using the package directly, the same controls are available through `GlobeOptions`:

```ts
globe({
  showBreadcrumbs: true,
  breadcrumbOffsetLeft: 60,
  breadcrumbOffsetTop: 92,
  showZoomControls: false,
  showCountryCardCloseButton: false,
  countryClickZoomLevel: 18,
  countryClickZoomDuration: 1120
})
```

Theme via JSON:

```text
https://your-globe-domain.example/?theme=%7B%22scene%22%3A%7B%22background%22%3A%22%2307090d%22%7D%7D
```

Theme via flat params:

```text
https://your-globe-domain.example/?theme.scene.background=%2307090d&theme.countries.border=0x122640
```

## Parent Window Events

When embedded in an iframe, the app posts events to `window.parent`:

- `boot`
- `ready`
- `error` (includes `message`)

Message shape:

```json
{ "source": "navpass-globe", "event": "ready" }
```

## Project Structure

- `src/index.ts`: globe runtime and interactions
- `src/main.ts`: standalone bootstrap and iframe configuration
- `src/globe/*`: globe layers, flights, picking/highlight logic, lighting
- `src/shaders/*`: shader programs
- `src/background/*`: starfield and radial backdrop
- `src/workers/flightHeatmapWorker.ts`: async heatmap generation
- `public/data/*`: countries and airport datasets
- `public/flags/*`: flag assets

## Data Sources

- Countries: `public/data/ne_110m_admin_0_countries.geojson`
- Airports: `public/data/airports_points.json`
- Flags: `public/flags/*.svg`
