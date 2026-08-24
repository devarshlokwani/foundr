/**
 * Generic text-file download: same Blob + object-URL + temporary <a>
 * pattern as csv.ts's downloadCsv, generalized to any mime type so the
 * import panel can offer JSON and CSV template downloads without csv.ts
 * needing to know about either.
 */
export function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
