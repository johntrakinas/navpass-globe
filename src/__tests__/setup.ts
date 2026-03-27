// rolldown-vite injects __vite_ssr_exportName__ in SSR transforms.
// Vitest's node environment doesn't define it, so polyfill it here.
// @ts-ignore
globalThis.__vite_ssr_exportName__ = (name: string) => name
