"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth/auth"
import {
  CompanyNotOwnedError,
  DocumentNotFoundError,
  FileTooLargeError,
  StorageError,
  UnsupportedFileTypeError,
  createDocument,
  deleteDocument,
  updateDocumentMetadata,
} from "@/server/services/document-service"
import {
  createDocumentSchema,
  documentIdSchema,
  updateDocumentSchema,
} from "@/server/validators/document-schemas"
import type { ActionResult } from "@/types/action-result"

// Every action calls auth() itself. Route protection guards navigation; an
// action is reachable directly, so the session check is the control here and
// the user id always comes from the session, never from the payload.

function revalidateDocument(id?: string) {
  revalidatePath("/documents")
  if (id) revalidatePath(`/documents/${id}`)
  // The company detail page lists a company's documents, so a link, an unlink
  // or a delete changes it too.
  revalidatePath("/companies", "layout")
}

/**
 * Takes FormData because a file cannot cross the action boundary any other way.
 * The client's size and type checks are UX; this is the authority, and the
 * signature check inside the service is what actually decides (§8.3).
 */
export async function createDocumentAction(formData: FormData): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = createDocumentSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    // Repeated entries rather than one JSON blob: FormData is already a
    // multimap, and a blob would need parsing before Zod could see it.
    tags: formData.getAll("tags"),
    companyId: formData.get("companyId"),
    expiresOn: formData.get("expiresOn"),
    file: formData.get("file"),
  })
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { file, ...metadata } = parsed.data
  const bytes = new Uint8Array(await file.arrayBuffer())

  try {
    const document = await createDocument(session.user.id, {
      ...metadata,
      // Display metadata only — the stored key's extension comes from the
      // registry entry the bytes matched, never from this string (§8.4).
      originalFilename: file.name,
      declaredContentType: file.type,
      bytes,
    })
    revalidateDocument(document.id)
    return { success: true }
  } catch (error) {
    return mapUploadError(error)
  }
}

export async function updateDocumentAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  const parsed = updateDocumentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data
  try {
    await updateDocumentMetadata(session.user.id, id, data)
    revalidateDocument(id)
    return { success: true }
  } catch (error) {
    return mapUploadError(error)
  }
}

export async function deleteDocumentAction(input: unknown): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, formError: "Unauthorized." }

  // A Server Action's argument is untrusted input, exactly like a form
  // payload: parsed here as a plain string so a crafted filter object (e.g.
  // `{ not: "" }`) fails to parse instead of reaching Prisma's `where`, which
  // is what turned one delete into a `deleteMany` across the whole vault.
  const parsed = documentIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, formError: "Something went wrong. Please try again." }
  }

  try {
    await deleteDocument(session.user.id, parsed.data.id)
    revalidateDocument(parsed.data.id)
    return { success: true }
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return { success: false, formError: error.message }
    }
    return { success: false, formError: "Something went wrong. Please try again." }
  }
}

/**
 * One mapping for both write paths (§12.2). `CompanyNotOwnedError`'s message is
 * "Company not found" and must stay that way: a refusal that confirmed the
 * company exists would be a cross-tenant read of exactly one bit.
 */
function mapUploadError(error: unknown): ActionResult {
  if (error instanceof UnsupportedFileTypeError || error instanceof FileTooLargeError) {
    return { success: false, fieldErrors: { file: [error.message] } }
  }
  if (error instanceof CompanyNotOwnedError) {
    return { success: false, fieldErrors: { companyId: [error.message] } }
  }
  if (error instanceof DocumentNotFoundError || error instanceof StorageError) {
    return { success: false, formError: error.message }
  }
  return { success: false, formError: "Something went wrong. Please try again." }
}
