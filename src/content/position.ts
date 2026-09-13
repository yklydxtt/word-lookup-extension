import type { WordSelection } from './selection';

export function placeCard(
  rect: WordSelection['rect'],
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const margin = 8;
  const left = Math.max(margin, Math.min(rect.left, viewport.width - size.width - margin));
  const below = rect.bottom + margin;
  const above = rect.top - size.height - margin;
  const preferred = below + size.height <= viewport.height - margin ? below : above;
  return {
    left,
    top: Math.max(margin, Math.min(preferred, viewport.height - size.height - margin)),
  };
}
