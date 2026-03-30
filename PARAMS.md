# Globe — URL Params Quick Reference

Append any of these to the iframe URL. All are optional.

```
?bgColor=0A1628&accentColor=00B4FF&showSelectBacking=0&airportKinds=large_airport,medium_airport
```

---

### General
| Param | Default | Values |
|---|---|---|
| `heatmap` | `0` | `0\|1` — flight heatmap overlay |
| `flightMode` | `reengineered` | `legacy\|reengineered` |
| `introAnimation` | `1` | `0\|1` |
| `assetBaseUrl` | Vite BASE_URL | string — CDN/subpath prefix |

### Data
| Param | Default | Values |
|---|---|---|
| `airportKinds` | `large_airport,medium_airport,small_airport` | comma-separated: `large_airport`, `medium_airport`, `small_airport`, `heliport`, `closed`, `balloonport` |
| `airportRenderLimit` | unlimited | number |
| `useFullAirportsDataset` | `1` | `0\|1` |
| `routesDataFile` | `flights_enriched.json` | filename |
| `airportsDataFile` | — | filename, overrides `useFullAirportsDataset` |

### Flights
| Param | Default | Values |
|---|---|---|
| `routeCount` | `180` | number |
| `planesPerRoute` | auto | number |
| `planeDensityScale` | `1.0` | number — `0.1` sparse → `2.0` dense |

### Camera
| Param | Default | Values |
|---|---|---|
| `minZoomDistance` | `14` | number, clamped `[12, 28]` |
| `maxZoomDistance` | `28` | number, clamped `[min+2, 60]` |
| `countryClickZoomLevel` | auto | number |
| `countryClickZoomDuration` | `1120` | ms, clamped `[120, 8000]` |
| `disableScrollZoom` | `0` | `0\|1` — alias: `disableScroll` |
| `scrollResetsView` | `1` | `0\|1` — scroll closes card + resets camera |

### UI
| Param | Default | Values |
|---|---|---|
| `showZoomControls` | `0` | `0\|1` — +/− buttons |
| `showBreadcrumbs` | `1` | `0\|1` |
| `breadcrumbOffsetLeft` | `50` | px |
| `breadcrumbOffsetTop` | `92` | px |
| `showCountryCardCloseButton` | `1` | `0\|1` |
| `animatedCards` | auto | `0\|1` |
| `disableMapInteraction` | `0` | `0\|1` — click/drag disabled, hover still works |
| `showSearchBarMobile` | breakpoint | `0\|1` |
| `searchBarX` | — | px |
| `searchBarY` | — | px |

### Card & theming
| Param | Default | Values |
|---|---|---|
| `accentColor` | `#ECB200` | hex — dot, breadcrumb, card border |
| `cardBackground` | `#0d1c30` | any CSS color or `transparent` |
| `cardBorderColor` | `rgba(255,255,255,0.08)` | hex or rgba |
| `cardBorderWidth` | `1` | px — `0` removes border |
| `showSelectBacking` | `1` | `0\|1` — thick shadow behind selected country border |

### Lighting
| Param | Default | Values |
|---|---|---|
| `lightIntensity` | `0` (off) | `0–2` — `0.3–0.8` for subtle glow |
| `lightColor` | theme day color | hex |
| `lightRadius` | `0.35` | `0.01–1.0` — `0.05` spotlight → `0.8` full wash |
| `lightX` / `lightY` / `lightZ` | camera-facing | world-space direction vector |

### Globe colors (shortcuts)
| Param | Default |
|---|---|
| `bgColor` | `#091320` |
| `countryLineColor` | `#4796FF` |
| `gridMainColor` | `#B8C0CE` |
| `gridEffectColor` | `#B8C0CE` |
| `glowColor` | `#ffffff` (neutral) |
| `hoverColor` | `#FBBC05` |
| `hoverAccentColor` | `#FBBC05` |
| `hoverCoreColor` | `#FBBC05` |
| `hoverPaletteMix` | `0.0` (`0–1`) |
| `selectedColor` | `#ffffff` |
| `selectedAccentColor` | `#FBBC05` |
| `airportDotColor` | `#FBBC05` — aliases: `airportColor`, `airportPulseColor` |
| `planeCoreColor` / `planeGlowColor` / `planeTintColor` / `planeAccentColor` | — |

### Full theme override
```
?theme=<URL-encoded JSON>
?theme.atmosphere.glowColor=%23FF6B35
?theme.highlights.hoverA=%23ffffff
?theme.scene.background=%2307090d
```
Dot-notation params have highest priority and override everything else.

### JS API
```ts
const app = globe(options)
await app.ready
app.setGlowColor('#FF9F40')  // update atmosphere tint at runtime
```
