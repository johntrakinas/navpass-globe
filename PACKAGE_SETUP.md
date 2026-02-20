# NAVPASS Globe Package - Team Setup Guide

This guide explains how to install and use the private package in internal projects:
- `@bytenana/globe` (from `ByteNana/navpass-globe`)
- `@navpass/globe` (from `navpass/navpass-website`)

## 1. Prerequisites

- Node.js 20+
- npm 9+
- Access to the private `ByteNana/navpass-globe` repository
- A GitHub Personal Access Token (classic) with:
  - `read:packages`
  - `repo` (required for private repositories)

## 2. Configure npm Authentication

Add this to your project-level `.npmrc` (choose the package scope you use):

`@bytenana/globe`:

```ini
@bytenana:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`@navpass/globe`:

```ini
@navpass:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Set your token in the shell before installing:

```bash
export NODE_AUTH_TOKEN=ghp_your_token_here
```

## 3. Install

`@bytenana/globe`:

```bash
npm i @bytenana/globe@0.1.2
```

`@navpass/globe`:

```bash
npm i @navpass/globe@0.1.2
```

## 4. Basic Usage

```ts
import globe from '@bytenana/globe'

const mountTarget = document.getElementById('app')!

globe({
  mountTarget,
  overlayTarget: document.body,
  assetBaseUrl: '/globe-assets',
  initialHeatmapEnabled: true
})
```

If you installed `@navpass/globe`, import from `@navpass/globe` instead.

## 5. Required Assets

Serve these files under the same base path used in `assetBaseUrl`:

- `data/ne_110m_admin_0_countries.geojson`
- `data/airports_points.json`
- `flags/*.svg`

Example:

- `assetBaseUrl: '/globe-assets'`
- Files available at:
  - `/globe-assets/data/ne_110m_admin_0_countries.geojson`
  - `/globe-assets/data/airports_points.json`
  - `/globe-assets/flags/us.svg` (and others)

## 6. Optional Runtime Options

- `injectDefaultUI` (default: `true`): injects package UI scaffolding/styles when host app does not provide them.
- `initialHeatmapEnabled` (default: `true` if no host toggle exists): controls heatmap initial state.
- `theme` (available in `0.1.2+`): overrides package colors for UI and 3D layers.

See `COLOR_THEME.md` for the full theme token reference.

## 7. Troubleshooting

### 401 Unauthorized

Check:

- `NODE_AUTH_TOKEN` is exported in the current shell.
- Token includes `read:packages` and `repo`.
- Token is authorized for org SSO (if your org enforces SSO).

Quick check:

```bash
npm whoami --registry=https://npm.pkg.github.com
```

### Package installs but UI looks broken

Check:

- `overlayTarget` is set (usually `document.body`).
- `assetBaseUrl` points to valid files.
- Do not block dynamically injected styles/scripts in your app shell.

### Heatmap not visible

Check:

- `initialHeatmapEnabled: true`
- Flight and data assets are loading correctly.

## 8. Security Notes

- Never commit tokens to git.
- Prefer token via environment variable (`NODE_AUTH_TOKEN`) or user-level `~/.npmrc`.
- Rotate tokens immediately if they are exposed.
