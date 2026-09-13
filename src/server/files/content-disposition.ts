/**
 * `Content-Disposition` construction (§8.4).
 *
 * A filename is user-supplied text going into an HTTP header, which is a
 * header-injection vector: a CRLF splits the response and an unescaped quote
 * breaks the parameter. So the header is generated here, never interpolated
 * at the call site.
 *
 * The same filename is rendered in the UI, where React escapes it — which is
 * why the display path needs nothing and this path needs all of the below.
 */

const MAX_FILENAME_LENGTH = 255

/** RFC 5987 `attr-char` is a narrow set; `encodeURIComponent` leaves
 *  `!'()*-._~` alone, and of those `'`, `(`, `)` and `*` are not attr-chars. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

function sanitise(filename: string): string {
  return (
    Array.from(filename)
      // Control characters, CR/LF and DEL included: these are what split a
      // response. Stripped, not replaced.
      .filter((char) => {
        const code = char.codePointAt(0) ?? 0
        return code > 0x1f && code !== 0x7f
      })
      .join("")
      // Path separators never belong in a display filename, and a name like
      // `../../etc/passwd` must not read as a path anywhere downstream.
      .replace(/[/\\]/g, "")
      .trim()
      .slice(0, MAX_FILENAME_LENGTH)
  )
}

/**
 * Build a `Content-Disposition` header value. `inline` previews, `attachment`
 * saves. The ASCII parameter is reduced to characters that cannot break the
 * quoted string; the RFC 5987 parameter carries the real name.
 *
 * `fallback` is the caller's, not this module's: the resume route wants
 * `resume.pdf` and the document route wants the registry's extension on a
 * generic stem. A module that builds headers has no business knowing which
 * feature asked.
 */
export function contentDisposition(
  disposition: "inline" | "attachment",
  filename: string,
  fallback: string = "download"
): string {
  const clean = sanitise(filename)
  const ascii = clean.replace(/[^A-Za-z0-9._-]/g, "") || fallback
  const extended = encodeRfc5987(clean || fallback)

  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${extended}`
}
