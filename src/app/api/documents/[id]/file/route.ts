import { auth } from "@/lib/auth/auth"
import { fileResponse } from "@/server/files/file-response"
import {
  DocumentNotFoundError,
  downloadFallbackName,
  readDocumentFile,
} from "@/server/services/document-service"

/**
 * The only route that emits document bytes (§8.6). It takes a row id, never a
 * storage key — no endpoint in this application accepts a storage key from a
 * client — and the id is authorisation-checked rather than secret: guessing a
 * valid cuid gets a 404, not a file.
 *
 * Nothing under `.uploads/` is statically served. It sits outside `public/` and
 * outside the route tree, so there is no other path to a document at all.
 */

/**
 * 404, never 401, and never a redirect to /login. This URL is loaded inside an
 * `<object>` and an `<img>`, so a redirect would render the login page *inside
 * the preview frame* and an `<img>` would simply break. It is also why §11
 * deliberately leaves this route out of the proxy matcher: the handler's own
 * `auth()` call is the control.
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
    file = await readDocumentFile(session.user.id, id)
  } catch (error) {
    // Not found, not yours, and a row whose object has gone missing all answer
    // the same way, with no body distinction between them.
    if (error instanceof DocumentNotFoundError) return notFound()
    return new Response(null, { status: 500 })
  }

  const { document, bytes } = file

  return fileResponse({
    bytes,
    // The row's stored type, which `fileResponse` looks up in the registry
    // rather than echoing: a type the allow-list no longer knows is served as
    // an opaque attachment, never rendered.
    storedContentType: document.contentType,
    filename: document.originalFilename,
    fallbackFilename: downloadFallbackName(document.contentType),
    download: new URL(request.url).searchParams.get("download") === "1",
  })
}
