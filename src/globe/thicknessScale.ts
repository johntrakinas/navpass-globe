// Single source of truth for visual thickness/size scaling.
// Increase/decrease this value to affect all connected "thickness" calculations.
export const GLOBAL_THICKNESS_MUL = 1.0

export function scaleThickness(value: number) {
  return value * GLOBAL_THICKNESS_MUL
}
