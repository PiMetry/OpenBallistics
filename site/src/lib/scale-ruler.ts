/** A readable 1, 2 or 5 interval that fits the available screen width. */
export function rulerInterval(pixelsPerUnit: number, available: number): number {
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0 || available <= 0) return 0;
  const limit = available / pixelsPerUnit;
  const power = 10 ** Math.floor(Math.log10(limit));
  return (limit / power >= 5 ? 5 : limit / power >= 2 ? 2 : 1) * power;
}
