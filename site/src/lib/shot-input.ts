/** Invalid rows are reported, never silently discarded from a group's score. */
export function parseShots(text: string): {
  shots: { xMm: number; yMm: number }[];
  invalidLines: number[];
} {
  const shots: { xMm: number; yMm: number }[] = [];
  const invalidLines: number[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const parts = line.includes(';')
      ? line.split(';').map(v => v.trim().replace(',', '.'))
      : line.includes(',') ? line.split(',').map(v => v.trim()) : line.trim().split(/\s+/);
    if (parts.length !== 2 || parts.some(v => !v.trim() || !Number.isFinite(Number(v)))) {
      invalidLines.push(index + 1);
    } else {
      shots.push({ xMm: Number(parts[0]), yMm: Number(parts[1]) });
    }
  });
  return { shots, invalidLines };
}
