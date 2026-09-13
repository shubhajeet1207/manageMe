import { auth } from "@/lib/auth/auth"
import { fileResponse } from "@/server/files/file-response"
import { PDF_CONTENT_TYPE } from "@/server/files/pdf"
import { ResumeVersionNotFoundError, readVersionFile } from "@/server/services/resume-service"

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

  return fileResponse({
    bytes,
    // The constant, not `version.contentType`: this path accepts one type and
    // the response must not be typeable by whoever uploaded the row.
    storedContentType: PDF_CONTENT_TYPE,
    filename: version.originalFilename,
    // Explicit, so this route's output is what it has always been rather than
    // the shared module's generic default.
    fallbackFilename: "resume.pdf",
    download: new URL(request.url).searchParams.get("download") === "1",
  })
}
