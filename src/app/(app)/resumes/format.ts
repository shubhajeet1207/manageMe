/** ISO dates everywhere, as the rest of the app does: a locale-formatted date
 *  renders differently on the server and the client and trips hydration. */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kilobytes = bytes / 1024
  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`
  return `${(kilobytes / 1024).toFixed(1)} MB`
}
