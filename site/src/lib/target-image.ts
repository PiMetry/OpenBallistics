import type { Shot } from '@lib/targets';
export interface PixelPoint { x: number; y: number }
export interface Calibration { centre: PixelPoint; pixelsPerMm: number }
export function calibrate(centre: PixelPoint, edge: PixelPoint, diameterMm: number): Calibration | undefined {
  if (![centre.x, centre.y, edge.x, edge.y, diameterMm].every(Number.isFinite) || diameterMm <= 0) return;
  const radiusPx = Math.hypot(edge.x - centre.x, edge.y - centre.y);
  if (radiusPx < 4) return;
  return { centre: { ...centre }, pixelsPerMm: radiusPx / (diameterMm / 2) };
}
export function pixelToShot(point: PixelPoint, calibration: Calibration): Shot {
  return { xMm: (point.x - calibration.centre.x) / calibration.pixelsPerMm, yMm: (calibration.centre.y - point.y) / calibration.pixelsPerMm };
}
/** Conservative local contrast suggestions, never confirmed shots. No image leaves the browser.
 * A circular core must differ from most surrounding samples in the same direction. This rejects
 * straight ring edges, but lettering and torn paper still need review. Overlaps are not resolved.
 */
export function suggestHoles(data: Uint8ClampedArray, width: number, height: number, calibration: Calibration, diameterMm: number, outerMm: number): PixelPoint[] {
  if (data.length !== width * height * 4 || ![width, height, diameterMm, outerMm, calibration.pixelsPerMm, calibration.centre.x, calibration.centre.y].every(Number.isFinite)) return [];
  const radius = diameterMm * calibration.pixelsPerMm / 2;
  if (radius < 1.5 || radius > 80 || width <= 0 || height <= 0 || outerMm <= 0) return [];
  const luminance = (x: number, y: number) => {
    const offset = (Math.round(y) * width + Math.round(x)) * 4;
    // Composite transparent pixels on white, matching the preview background.
    const alpha = data[offset + 3]! / 255;
    return (data[offset]! * .2126 + data[offset + 1]! * .7152 + data[offset + 2]! * .0722) * alpha + 255 * (1 - alpha);
  };
  const candidates: (PixelPoint & { contrast: number })[] = [];
  const margin = Math.ceil(radius * 1.8), step = Math.max(1, Math.floor(radius / 2));
  const maxRadius = outerMm * calibration.pixelsPerMm / 2 + radius * 2;
  const directions = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos(i * Math.PI / 4), y: Math.sin(i * Math.PI / 4) }));
  for (let y = margin; y < height - margin; y += step) {
    for (let x = margin; x < width - margin; x += step) {
      if (Math.hypot(x - calibration.centre.x, y - calibration.centre.y) > maxRadius) continue;
      const core = [luminance(x, y), ...directions.map(d => luminance(x + d.x * radius * .35, y + d.y * radius * .35))];
      // A thin ring crossing a sampling point is not a filled circular hole.
      if (Math.max(...core) - Math.min(...core) > 60) continue;
      const centre = core.reduce((sum, v) => sum + v, 0) / core.length;
      const differences = directions.map(d => centre - luminance(x + d.x * radius * 1.7, y + d.y * radius * 1.7));
      if (Math.max(differences.filter(d => d > 40).length, differences.filter(d => d < -40).length) < 7) continue;
      const contrast = Math.abs(differences.reduce((sum, d) => sum + d, 0) / 8);
      candidates.push({ x, y, contrast });
    }
  }
  candidates.sort((a, b) => b.contrast - a.contrast);
  const chosen: PixelPoint[] = [];
  for (const candidate of candidates) {
    if (chosen.every(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) > radius * 2)) chosen.push({ x: candidate.x, y: candidate.y });
    if (chosen.length === 100) break;
  }
  return chosen;
}
