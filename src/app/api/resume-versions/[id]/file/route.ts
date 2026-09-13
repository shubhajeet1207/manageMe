import { auth } from "@/lib/auth/auth"
import { contentDisposition } from "@/server/files/content-disposition"
import { PDF_CONTENT_TYPE } from "@/server/files/pdf"
import { ResumeVersionNotFoundError, readVersionFile } from "@/server/services/resume-service"

/**
 * The only route that emits uploaded bytes (§8.4). It takes a row id, never a
 * storage key, and the id is authorisation-checked rather than secret:
 * guessing a valid one gets a 404, not a file.
 */

/**
 * 404, never 401, and never a redirect to /login. This URL is loaded inside an
 * `<object>`, so a redirect would render the login page *inside the preview
 * frame* — a worse failure than an empty frame with a real fallback link. It is
 * also why §11 deliberately leaves this route out of the proxy matcher: the
 * handler's own `auth()` call is the control.
 */
function notFound(): Response {
  return new Response(null, { status: 404 })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user?.id) return notFound()

  const { id } = await params

  let file
  try {
    file = await readVersionFile(session.user.id, id)
  } catch (error) {
    // Not found, not yours, and a row whose object has gone missing all answer
    // the same way, with no body distinction between them.
    if (error instanceof ResumeVersionNotFoundError) return notFound()
    return new Response(null, { status: 500 })
  }

  const { version, bytes } = file
  const download = new URL(request.url).searchParams.get("download") === "1"

  // Re-wrapped because the driver's Uint8Array is generic over ArrayBufferLike
  // (it may be a SharedArrayBuffer for all the type knows) and BodyInit is not.
  // A copy is irrelevant against a 10MB ceiling and beats a cast.
  return new Response(new Uint8Array(bytes), {
    headers: {
      // A server-chosen literal. Never the declared or stored value echoed
      // back, so the response cannot be typed by whoever uploaded it — which,
      // with nosniff below, is what makes a PDF/HTML polyglot inert.
      "Content-Type": PDF_CONTENT_TYPE,
      "X-Content-Type-Options": "nosniff",
      // Generated, never interpolated: the filename is user-supplied text
      // going into a header, which is a header-injection vector.
      "Content-Disposition": contentDisposition(
        download ? "attachment" : "inline",
        version.originalFilename
      ),
      "Cache-Control": "private, no-store",
      // At a 10MB ceiling the whole object is one response; advertising ranges
      // we do not implement makes viewers retry.
      "Accept-Ranges": "none",
      // The buffer's length, not `sizeBytes` from the row — a mismatch would
      // truncate the response. The column is for display.
      "Content-Length": String(bytes.byteLength),
    },
  })
}
