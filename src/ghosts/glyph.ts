import type { SoundClass, Urgency } from '../events';
import { URGENCY_STYLE } from './constants';
import { SHAPES } from './shapes';

/** What a list glyph draws: the class path, the 24-unit view box, the size and the outline weight of the urgency. */
export interface GlyphSpec {
  path: string;
  viewBox: '0 0 24 24';
  sizePx: number;
  strokeWidth: number;
}

/** Glyph edge in px for each urgency. */
export const GLYPH_SIZE_PX: Readonly<Record<Urgency, number>> = Object.freeze({ low: 24, medium: 32, high: 40 });

/** The glyph of a class at an urgency. Pure. */
export function glyphSpec(cls: SoundClass, urgency: Urgency): GlyphSpec {
  return { path: SHAPES[cls], viewBox: '0 0 24 24', sizePx: GLYPH_SIZE_PX[urgency], strokeWidth: URGENCY_STYLE[urgency].outlineWidth };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An inline SVG ghost for lists, hidden from screen readers (the text next to it is the content). No glow:
 * size and outline weight carry the urgency. Colours come from the `bb-ghost-glyph` class in `field.css`.
 */
export function createGlyph(cls: SoundClass, urgency: Urgency): SVGSVGElement {
  const spec = glyphSpec(cls, urgency);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bb-ghost-glyph');
  svg.setAttribute('viewBox', spec.viewBox);
  svg.setAttribute('width', String(spec.sizePx));
  svg.setAttribute('height', String(spec.sizePx));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset.class = cls;
  svg.dataset.urgency = urgency;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', spec.path);
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('stroke-width', String(spec.strokeWidth));
  svg.append(path);
  return svg;
}
