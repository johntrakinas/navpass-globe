# Color Theming Reference (`@bytenana/globe` / `@navpass/globe`)

Color theming is available in both package scopes starting in version `0.1.2`.

## Quick Start

```ts
import globe from '@bytenana/globe'

const app = globe({
  mountTarget: document.getElementById('app')!,
  overlayTarget: document.body,
  assetBaseUrl: '/globe-assets',
  theme: {
    scene: {
      background: '#03070f'
    },
    countries: {
      border: '#7cf5d7'
    },
    flights: {
      lineBaseColor: '#7cf5d7',
      heatHotColor: '#ffe48c'
    }
  }
})

await app.ready
```

If using Navpass scope, replace the import with `@navpass/globe`.

## Theme Types

The package exports these types:

- `GlobeTheme`
- `GlobeUiTheme`
- `GlobeSceneTheme`
- `GlobeCountriesTheme`
- `GlobeGridTheme`
- `GlobeLandWaterTheme`
- `GlobeAtmosphereTheme`
- `GlobeLightingTheme`
- `GlobePointsTheme`
- `GlobeFlightsTheme`
- `GlobeHighlightTheme`

All keys are optional when used inside `GlobeTheme` (`Partial<...>` behavior).

## Value Formats

- `theme.ui.*`: `string` CSS colors (`#hex`, `rgb()`, `rgba()`, `hsl()`, etc).
- Other sections: `THREE.ColorRepresentation` (`'#rrggbb'`, `0xffffff`, `THREE.Color`, etc).
- `theme.highlights.hoverPaletteMix`: `number` in range `0..1`.

## Full Token List

### `theme.ui`

- `panelBg`: floating route label background.
- `panelBorder`: floating route label border.
- `panelText`: floating route label text color.
- `panelShadow`: floating route label shadow color.
- `panelSurface`: floating route label close button surface.
- `panelSurfaceBorder`: floating route label close button border.
- `panelShellBg`: country panel shell background.
- `panelShellBorder`: country panel shell border.
- `panelShellShadow`: country panel shell shadow.
- `panelDivider`: dividers inside country panel.
- `panelLiveText`: live monitoring subtitle text.
- `panelLiveDot`: live monitoring dot color.
- `panelClose`: country panel close button color.
- `panelFlagBorder`: country flag box left border.
- `panelFlagEmptyBg`: fallback background when no flag.
- `panelStatLabel`: incoming/outgoing label color.
- `panelStatValue`: incoming/outgoing value color.
- `panelStatSub`: incoming/outgoing subtext color.
- `panelAircraftLabel`: aircraft label color.
- `panelAircraftValue`: aircraft value color.
- `panelFooterBg`: country panel footer background.
- `panelTotalLabel`: total flights label color.
- `panelTotalValue`: total flights value color.
- `panelMoreBorder`: "Learn More" button border.
- `panelMoreBg`: "Learn More" button background.
- `panelMoreText`: "Learn More" button text color.
- `panelMoreHoverBg`: "Learn More" hover background.
- `tooltipBg`: hover tooltip background.
- `tooltipBorder`: hover tooltip border.
- `tooltipText`: hover tooltip text.
- `uiBg`: heatmap toggle container background.
- `uiBorder`: heatmap toggle container border.
- `uiText`: heatmap toggle label color.
- `uiTrack`: heatmap switch track color.
- `uiThumb`: heatmap switch thumb color.
- `uiShadow`: heatmap toggle container shadow.
- `focusDimBg`: full-screen focus dim overlay color.
- `railInfoBorderIdle`: story info button border (collapsed).
- `railInfoBorderActive`: story info button border (expanded).

### `theme.scene`

- `background`: scene background color.
- `depthMask`: depth mask sphere color.
- `innerSphere`: inner sphere color.

### `theme.countries`

- `border`: country border line color.

### `theme.grids`

- `triColor`: tri-grid base color.
- `triShimmerColor`: tri-grid shimmer color.
- `latLonColor`: lat/lon grid base color.
- `latLonShimmerColor`: lat/lon grid shimmer color.

### `theme.landWater`

- `landTint`: land fill tint.
- `coastTint`: coastline tint.

### `theme.atmosphere`

- `innerCore`: inner atmosphere core color.
- `innerRim`: inner atmosphere rim color.
- `outerCore`: outer atmosphere core color.
- `outerRim`: outer atmosphere rim color.
- `subsurfaceCore`: subsurface atmosphere core color.
- `subsurfaceRim`: subsurface atmosphere rim color.

### `theme.lighting`

- `shadow`: night-side shadow tint.
- `day`: day-side light tint.

### `theme.points`

- `dotColorMul`: airport/light point color multiplier.
- `dotFlowColor`: points flow accent color.
- `nightWarmA`: first night lights warm color.
- `nightWarmB`: second night lights warm color.

### `theme.flights`

- `lineBaseColor`: route line base color.
- `lineHeadColor`: route line head color.
- `lineTailColor`: route line tail color.
- `lineAccentColor`: route line accent color (head glint/selection).
- `planeCoreColor`: plane core color.
- `planeGlowColor`: plane glow color.
- `planeTintColor`: plane directional tint color.
- `planeAccentColor`: plane selection accent color.
- `heatColdColor`: heatmap cold color.
- `heatMidColor`: heatmap mid color.
- `heatHotColor`: heatmap hot color.
- `heatEdgeAccentColor`: heatmap edge accent color.
- `endpointOriginColor`: route endpoint origin color.
- `endpointDestColor`: route endpoint destination color.
- `endpointAccentColor`: endpoint accent color.
- `pinHoverColor`: hover route pin color.
- `pinSelectedColor`: selected route pin color.
- `hubColorMul`: airport hub color multiplier.

### `theme.highlights`

- `hoverA`: hover highlight base color A.
- `hoverB`: hover highlight base color B.
- `hoverCore`: hover core blend color.
- `hoverPaletteMix`: amount of animated palette mix (`0..1`).
- `selectedA`: selected-country palette color A.
- `selectedB`: selected-country palette color B.
- `selectedC`: selected-country palette color C.
- `selectedD`: selected-country palette color D.

## Notes

- If you omit a token, the package default is used.
- You can override a single token without redefining the whole section.
- Source of truth for defaults: `src/index.ts` (`DEFAULT_*_THEME` constants).
