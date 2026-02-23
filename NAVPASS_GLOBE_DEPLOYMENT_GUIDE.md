# NAVPASS Globe Deployment Guide

This guide covers standalone deployment and Webflow iframe embedding.

## 1. Build

```bash
npm install
npm run build
```

Output is generated in `dist/`.

## 2. Host `dist/`

Deploy `dist/` to a static host:
- Cloudflare Pages
- Vercel (static)
- Netlify
- S3 + CloudFront

If the app is served under a subpath, set Vite base when building:

```bash
vite build --base=/globe/
```

## 3. Verify Required Assets

The built app must serve:
- `data/ne_110m_admin_0_countries.geojson`
- `data/airports_points.json`
- `flags/*.svg`

## 4. Webflow Iframe Embed

Use an Embed block in Webflow:

```html
<iframe
  src="https://your-globe-domain.example"
  title="NAVPASS Globe"
  loading="lazy"
  style="width:100%;height:100vh;border:0;display:block;"
  allow="fullscreen"
></iframe>
```

Adjust `height` to your section layout (`100vh`, fixed px, or responsive container).

## 5. Optional Runtime Params

Append query params to the iframe URL:

- `assetBaseUrl=/globe-assets`
- `heatmap=true|false`
- `injectDefaultUI=true|false`
- `flightMode=legacy|reengineered`
- `minZoomDistance=17`
- `maxZoomDistance=32`
- `theme=<JSON url-encoded>`
- `theme.<section>.<token>=<value>`

Example:

```text
https://your-globe-domain.example/?heatmap=false&flightMode=legacy&minZoomDistance=18
```

Theme via JSON:

```text
https://your-globe-domain.example/?theme=%7B%22scene%22%3A%7B%22background%22%3A%22%2307090d%22%7D%7D
```

Theme via flat params:

```text
https://your-globe-domain.example/?theme.scene.background=%2307090d&theme.flights.lineBaseColor=%23ffe28a
```

## 6. Parent-Frame Events

When loaded in an iframe, the app sends:

- `boot`
- `ready`
- `error`

Message shape:

```json
{ "source": "navpass-globe", "event": "ready" }
```

Listen from the parent site if needed for loading/error UI.
