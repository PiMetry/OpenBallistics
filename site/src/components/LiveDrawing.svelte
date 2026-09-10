<script lang="ts">
  import ScaleRuler from './ScaleRuler.svelte';
  /**
   * A cartridge drawn here, now, from its profiles - not a shipped file.
   *
   * Redraw the cutaway while the bullet is dragged. `lib/geometry` supplies the profiles:
   * the brass in section, the whole bullet where it sits, and the charge under it.
   */
  import { type Profile } from '@lib/geom';
import { type Profiles } from '@lib/geometry';
import { exposedProfile, type Bullet } from '@lib/shapes2d';
  import { sectionParts } from '@lib/render2d/render';
  import { svgHeader, viewportFor, type Frame, type Viewport } from '@lib/geom';
  import {
    annotate,
    bulletDimensions,
    metallicAngles,
    metallicCallouts,
    metallicDimensions,
    PAGE_MARGIN_MM,
    pageMargins,
    type AngleMark,
    type Callout,
    type Dimension
  } from '@lib/render2d/technical';
  import { PX_PER_MM } from '@lib/core';

  interface Props {
    profiles: Profiles;
    bullet: Bullet | null;
    bulletProfile: Profile | null;
    inner: Profile | null;
    /** Where the settled charge reaches, mm from the head face; nothing drawn if absent. */
    powderLevelZ?: number | null;
    frame?: Frame;
    /** Pixels per millimetre on screen, as a multiple of life size. */
    zoom?: number;
    marginMm?: number;
    /**
     * The dimension layer over the cutaway: the case's columns and the round's `L6`, which
     * follows the drag. The page grows for it as the file's does.
     */
    dimensions?: boolean;
  }
  let {
    profiles, bullet, bulletProfile, inner, powderLevelZ = null, frame = 'landscape', zoom = 1, marginMm = 4,
    dimensions = false
  }: Props = $props();

  const SCALE = 4;
  /**
   * This panel's own namespace for its clip ids. The page also holds the record's card drawing,
   * which is a separate `<svg>` in the same document; an id is global, so two drawings that
   * share one both resolve to whichever came first and the loser is clipped by a contour drawn
   * in another drawing's coordinates - which is to say, clipped away.
   */
  const IDS = 'seat-';

  const drawn = $derived.by(() => {
    const shown = [profiles.outline, ...(bulletProfile ? [bulletProfile] : [])];
    const c = profiles.case;
    let dims: Dimension[] = [], angles: AngleMark[] = [], callouts: Callout[] = [];
    let exposed: Profile | null = null;
    let margins = {};
    if (dimensions) {
      exposed = bullet ? exposedProfile(bullet, c.mouth.z) : null;
      dims = metallicDimensions(c).concat(bullet ? bulletDimensions(c, bullet, exposed !== null) : []);
      angles = metallicAngles(c);
      callouts = metallicCallouts(c);
      margins = pageMargins(dims, angles, callouts, [profiles.outline, ...(exposed ? [exposed] : [])], false, frame);
    }
    const view = viewportFor(shown, { scale: SCALE, frame, marginMm: dimensions ? PAGE_MARGIN_MM : marginMm, ...margins });
    const [defs, parts] = sectionParts(c, profiles.outline, inner, bullet, bulletProfile, view, powderLevelZ, IDS);
    // The dimension ink is recoloured for a dark page by the site's stylesheet (`app.css`).
    const layer = dimensions ? annotate(dims, angles, callouts, profiles.outline.concat(exposed ?? []), view)[0] : '';
    return {
      view,
      markup: [svgHeader(view, c.name), '<defs>', defs, '</defs>', ...parts, layer, '</svg>'].join(''),
      widthMm: view.width / SCALE,
      heightMm: view.height / SCALE
    };
  });

  export function viewport(): Viewport {
    return drawn.view;
  }
  /** Pixels per user unit on screen, for whoever maps a pointer back to millimetres. */
  export function pixelsPerUnit(): number {
    return (PX_PER_MM * zoom) / SCALE;
  }
</script>

<!--
  The markup is a complete <svg>, the same one the renderer would write, so a plain block hosts it
  and the size in pixels follows the millimetres.
-->
<div class="live-ink" style={`width:${(drawn.widthMm * PX_PER_MM * zoom).toFixed(1)}px;height:${(drawn.heightMm * PX_PER_MM * zoom).toFixed(1)}px`}>
  {@html drawn.markup}
</div>
<ScaleRuler widthMm={drawn.widthMm} />

<style>
  @layer legacy {
  .live-ink {
    display: block;
  }
  .live-ink :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  }
</style>
