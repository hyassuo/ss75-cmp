// Trigger a browser download for an in-memory Blob.
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking synchronously can abort the download in Safari/Firefox before
  // the browser has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
