import { auth } from "@/lib/auth/auth"
import { fileResponse } from "@/server/files/file-response"
import { PDF_CONTENT_TYPE } from "@/server/files/pdf"
import { ResumeVersionNotFoundError, openVersionFile } from "@/server/services/resume-service"
import { hasControlChars } from "@/server/validators/limits"

/**
 * The only route that emits resume bytes (§8.4). It takes a row id, never a
 * storage key, and the id is authorisation-checked rather than secret:
 * guessing a valid one gets a 404, not a file.
 *
 * The header set itself lives in `file-response.ts`, shared with the document
 * vault's route (Phase 4 §5.2): the day a header needs adding, one file should
 * change rather than two.
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

  // Same guard as the document vault's file route: a NUL byte or other
  // control character is invalid in a Postgres `text` value and would 500
  // instead of simply not matching a row.
  if (hasControlChars(id)) return notFound()

  const download = new URL(request.url).searchParams.get("download") === "1"

  let file
  try {
    file = await openVersionFile(session.user.id, id, download)
  } catch (error) {
    // Not found, not yours, and a row whose object has gone missing all answer
    // the same way, with no body distinction between them.
    if (error instanceof ResumeVersionNotFoundError) return notFound()
    return new Response(null, { status: 500 })
  }

  // The signed URL already carries the type and disposition this route would
  // have set; 302 rather than 301 because it expires in minutes and must never
  // be cached as permanent.
  if (file.kind === "redirect") return Response.redirect(file.url, 302)

  const { version, bytes } = file

  return fileResponse({
    bytes,
    // The constant, not `version.contentType`: this path accepts one type and
    // the response must not be typeable by whoever uploaded the row.
    storedContentType: PDF_CONTENT_TYPE,
    filename: version.originalFilename,
    // Explicit, so this route's output is what it has always been rather than
    // the shared module's generic default.
    fallbackFilename: "resume.pdf",
    download,
  })
}
