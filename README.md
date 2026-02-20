# NAVPASS Globe

Interactive 3D globe for global flight visualization, built with pure Three.js and custom shaders.

## Package Usage

```ts
import globe from '@bytenana/globe'

const app = globe()
await app.ready
```

Optional mount targets:

```ts
import globe from '@bytenana/globe'

const app = globe({
  mountTarget: document.getElementById('app')!,
  overlayTarget: document.body,
  assetBaseUrl: '/globe-assets'
})
```

Color theming (all project color groups are overridable):

```ts
import globe from '@bytenana/globe'

const app = globe({
  theme: {
    ui: {
      panelShellBg: '#10131f',
      panelText: '#e8f0ff',
      tooltipBg: 'rgba(12, 16, 28, 0.92)',
      uiThumb: '#7ef7d8'
    },
    scene: {
      background: '#04070d',
      depthMask: '#04070d',
      innerSphere: '#04070d'
    },
    countries: {
      border: '#7ef7d8'
    },
    grids: {
      triColor: '#8dd7ff',
      latLonColor: '#78ffd6'
    },
    landWater: {
      landTint: '#2e5a7a',
      coastTint: '#8fd5ff'
    },
    atmosphere: {
      innerRim: '#8fd5ff',
      outerRim: '#b1e6ff'
    },
    lighting: {
      shadow: '#0d2f5f',
      day: '#b7e4ff'
    },
    points: {
      dotColorMul: '#d8f2ff',
      dotFlowColor: '#7ef7d8',
      nightWarmA: '#ffe08a',
      nightWarmB: '#fff2c9'
    },
    flights: {
      lineBaseColor: '#7ef7d8',
      lineHeadColor: '#eaffff',
      lineTailColor: '#9cd2ff',
      heatColdColor: '#184c8f',
      heatMidColor: '#4dd8ff',
      heatHotColor: '#ffe98f'
    },
    highlights: {
      hoverA: '#c6faff',
      hoverB: '#7ef7d8',
      hoverPaletteMix: 0.0,
      selectedA: '#58c4ff',
      selectedB: '#43d187',
      selectedC: '#ffd166',
      selectedD: '#ff6b6b'
    }
  }
})
```

All theme keys are optional. The exported TypeScript types (`GlobeTheme`, `GlobeUiTheme`, etc.) describe every available color token.
For complete token reference and per-key descriptions, see `COLOR_THEME.md`.

`assetBaseUrl` must point to a folder containing:
- `data/ne_110m_admin_0_countries.geojson`
- `data/airports_points.json`
- `flags/*.svg`

## Install From GitHub Packages (Private)

For a complete team onboarding guide, see `PACKAGE_SETUP.md`.
For color theming reference, see `COLOR_THEME.md`.

This package is published with two equivalent scopes:
- `@bytenana/globe` from `ByteNana/navpass-globe`
- `@navpass/globe` from `navpass/navpass-website`

In the consumer project `.npmrc` (choose one scope):

```ini
@bytenana:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then install:

```bash
NODE_AUTH_TOKEN=ghp_xxx npm i @bytenana/globe
```

For Navpass scope:

```ini
@navpass:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
NODE_AUTH_TOKEN=ghp_xxx npm i @navpass/globe
```

This project focuses on a dramatic, high-contrast visual language and stable, deliberate interaction:
- dark monochromatic globe style with brighter borders and atmospheric grid layers
- slow drag behavior with damping/inertia (no frantic spinning)
- dense mocked traffic for heavy-route scenarios
- country and route-focused interaction with clean UI overlays

## Current State

The current implementation includes:
- quaternion-based globe rotation (stable yaw/pitch without roll drift)
- country hover/selection with clear border highlighting
- synthetic airport inflation + mocked flight network (`MOCK_FLIGHT_ROUTE_COUNT = 2800`)
- animated routes and planes (high-density rendering)
- route heatmap toggle
- route selection card/tooltip
- route endpoints visible on selected routes
- slow idle rotation with periodic brake-like pauses
- day/night lighting, atmosphere, tri-grid and lat/lon grid shells
- starfield background and story presets

## Tech Stack

- Three.js
- TypeScript
- Vite (`rolldown-vite`)
- GLSL shaders (`ShaderMaterial`)
- Natural Earth GeoJSON for country data

## Project Structure

- `src/index.ts`: package entry (`globe(options)`) and runtime wiring
- `src/main.ts`: demo app bootstrap for local Vite development
- `src/lib.ts`: library build entry re-export
- `src/globe/*`: globe layers, flight system, picking/highlight logic, lighting
- `src/shaders/*`: shader programs for routes, planes, atmosphere, endpoints, heatmap
- `src/background/*`: starfield rendering
- `src/workers/flightHeatmapWorker.ts`: async heatmap texture generation
- `public/data/*`: country and airport source data
- `public/flags/*`: flag assets used by the country/route UI

## Getting Started

Requirements:
- Node.js 20+ recommended
- npm

Install and run in development:

```bash
npm install
npm run dev
```

Build and preview production:

```bash
npm run build
npm run preview
```

Build package artifacts (ESM + `.d.ts`):

```bash
npm run build:lib
```

## Available Scripts

- `npm run dev`: starts local dev server
- `npm run typecheck`: runs TypeScript checks (`tsc --noEmit`)
- `npm run build`: typecheck + production build
- `npm run build:lib`: typecheck + library build (`dist/globe.*.js` + types)
- `npm run preview`: serves the production build locally

## Data Sources

- Countries: `public/data/ne_110m_admin_0_countries.geojson`
- Airports: `public/data/airports_points.json`
- Flags: `public/flags/*.svg`

## Interaction Notes

- Left-drag rotates the globe slowly with controlled inertia.
- Quick strong pull + release adds a short extra spin before stopping.
- Country click focuses the globe and updates contextual information.
- Route click pins route information and displays route endpoints.
- Heatmap can be toggled to emphasize global traffic density.

## About (GitHub Short Description)

High-contrast Three.js globe for flight intelligence, with custom shaders, dense mocked routes, country/route focus interactions, and heatmap visualization.
