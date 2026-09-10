export function downloadJson(value: unknown, filename: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/[^A-Za-z0-9_.-]/g, '_');
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
