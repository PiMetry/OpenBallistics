/**
 * `render2d` - the drawing layer: the coloured face, the dimension layer, the merged drawing and
 * the bullet's own.
 *
 * `render` also exports geometry helpers, so this entry point keeps it separate
 * to avoid duplicating the geometry API.
 * Import it as `@lib/render2d/render`.
 */

export * from './technical';
export * from './drawing';
export * from './bulletDrawing';
