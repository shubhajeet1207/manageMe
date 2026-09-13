import { randomUUID } from "node:crypto"
import {
  DOCUMENT_CONTENT_TYPES,
  findContentType,
  validateUpload,
} from "@/server/files/content-types"
import { FileTooLargeError, StorageError } from "@/server/files/file-errors"
import * as documentRepository from "@/server/repositories/document-repository"
import type {
  CreateDocumentData,
  DocumentMetadata,
  DocumentSearch,
  DocumentWithCompany,
} from "@/server/repositories/document-repository"
import { assertCompanyOwned } from "@/server/services/company-service"
import { getStorage } from "@/server/storage"
import type { Document } from "@prisma/client"

export { FileTooLargeError, StorageError } from "@/server/files/file-errors"
export { CompanyNotOwnedError } from "@/server/services/company-service"

export class DocumentNotFoundError extends Error {
  constructor() {
    super("Document not found")
    this.name = "DocumentNotFoundError"
  }
}

export class UnsupportedFileTypeError extends Error {
  constructor() {
    super("Upload a PDF, PNG, JPEG or WebP file.")
    this.name = "UnsupportedFileTypeError"
  }
}

export type UploadDocumentData = DocumentMetadata & {
  /** The client's filename. Display metadata only — it never reaches a key. */
  originalFilename: string
  /** `file.type` from the browser: a claim, not evidence. Checked, not trusted. */
  declaredContentType: string
  bytes: Uint8Array
}

/** Only when one is supplied: an undefined `companyId` means "no company", and
 *  unlinking is always allowed. */
async function assertLinkedCompanyOwned(
  userId: string,
  companyId: string | undefined
): Promise<void> {
  if (companyId === undefined) return
  await assertCompanyOwned(userId, companyId)
}

export function listDocuments(
  userId: string,
  search: DocumentSearch
): Promise<DocumentWithCompany[]> {
  return documentRepository.listByUser(userId, search)
}

export function countDocuments(userId: string): Promise<number> {
  return documentRepository.countByUser(userId)
}

export function listDocumentTags(userId: string): Promise<{ tag: string; count: number }[]> {
  return documentRepository.listTags(userId)
}

export function listDocumentsForCompany(
  userId: string,
  companyId: string
): Promise<Document[]> {
  return documentRepository.listByCompany(userId, companyId)
}

/** Not found and not yours throw the same error, so the page renders the same
 *  not-found and the route answers the same 404. */
export async function getDocument(userId: string, id: string): Promise<DocumentWithCompany> {
  const document = await documentRepository.findById(userId, id)
  if (!document) throw new DocumentNotFoundError()
  return document
}

/**
 * §8.7 — validate, guard the company, write bytes, then write the row.
 *
 * Storage first, because the inverse failure is worse: a row written before its
 * bytes points at an object that never arrived, and the preview 404s on a
 * document the vault insists exists. An orphaned object costs disk; a dangling
 * row costs correctness.
 *
 * No transaction, unlike the resume upload's — that one needs one because a
 * version insert and the slot's `currentVersionId` update must agree. A
 * document is one row.
 */
export async function createDocument(
  userId: string,
  data: UploadDocumentData
): Promise<Document> {
  // 1. The bytes decide. The declared type and size are client claims;
  //    `bytes.byteLength` is the only unarguable number here.
  const validation = validateUpload(
    data.bytes,
    data.declaredContentType,
    data.bytes.byteLength,
    DOCUMENT_CONTENT_TYPES
  )
  if (!validation.ok) {
    if (validation.reason === "too-large") throw new FileTooLargeError()
    throw new UnsupportedFileTypeError()
  }

  // 2. The company must be the caller's — checked before a single byte is
  //    written, because repository scoping cannot see a foreign id in a row
  //    that otherwise carries the caller's own userId.
  await assertLinkedCompanyOwned(userId, data.companyId)

  // 3. Every segment is server-generated (§8.4): the session's userId, a fresh
  //    UUID, and the extension from the registry entry the BYTES matched —
  //    never from the uploaded filename, which is stored for display only.
  const storageKey = `documents/${userId}/${randomUUID()}${validation.spec.extension}`

  const storage = getStorage()
  try {
    await storage.put(storageKey, data.bytes, validation.spec.contentType)
  } catch (error) {
    console.error("Failed to store upload", storageKey, error)
    throw new StorageError()
  }

  try {
    const input: CreateDocumentData = {
      title: data.title,
      description: data.description,
      tags: data.tags,
      companyId: data.companyId,
      expiresOn: data.expiresOn,
      originalFilename: data.originalFilename,
      storageKey,
      contentType: validation.spec.contentType,
      sizeBytes: data.bytes.byteLength,
    }
    return await documentRepository.create(userId, input)
  } catch (error) {
    // Step 6: best effort, logged. The uncommon case — the process dying
    // between the put and the insert — leaves an unreferenced object for
    // Phase 7's sweep.
    try {
      await storage.remove(storageKey)
    } catch (cleanupError) {
      console.error("Failed to roll back stored object", storageKey, cleanupError)
    }
    throw error
  }
}

export async function updateDocumentMetadata(
  userId: string,
  id: string,
  data: DocumentMetadata
): Promise<Document> {
  const existing = await documentRepository.findById(userId, id)
  if (!existing) throw new DocumentNotFoundError()

  await assertLinkedCompanyOwned(userId, data.companyId)

  const updated = await documentRepository.update(userId, id, data)
  if (!updated) throw new DocumentNotFoundError()
  return updated
}

/**
 * Rows first, then bytes, matching `deleteResume` for its reason: a failed
 * object delete leaves an orphan for Phase 7 to sweep, where the inverse would
 * leave a row whose preview 404s. Nothing refuses — a document is referenced by
 * nothing, which is why it needs no `Restrict` anywhere.
 */
export async function deleteDocument(userId: string, id: string): Promise<void> {
  const document = await documentRepository.findById(userId, id)
  if (!document) throw new DocumentNotFoundError()

  // Deleted by the ROW's own id, not the caller's `id` argument again: reusing
  // the argument here would run a second, independent `deleteMany` against
  // whatever it matches, which is exactly how one delete became eight when
  // `id` arrived unvalidated. Keying off `document.id` ties the delete to the
  // single row this function already resolved and is about to clean up.
  const deleted = await documentRepository.remove(userId, document.id)
  if (!deleted) throw new DocumentNotFoundError()

  try {
    await getStorage().remove(document.storageKey)
  } catch (error) {
    // Best effort: the row is gone, so the object is unreferenced, and the
    // user's action succeeded. Logged with the key; never surfaced.
    console.error("Failed to remove stored object", document.storageKey, error)
  }
}

/**
 * The bytes behind §8.6, with the ownership check in front of them. A row whose
 * object is missing is a server-side problem, logged here and answered with the
 * same not-found the client gets for everything else.
 */
export async function readDocumentFile(
  userId: string,
  id: string
): Promise<{ document: DocumentWithCompany; bytes: Uint8Array }> {
  const document = await getDocument(userId, id)

  let bytes: Uint8Array | null
  try {
    bytes = await getStorage().get(document.storageKey)
  } catch (error) {
    console.error("Failed to read stored object", document.storageKey, error)
    throw new StorageError()
  }

  if (!bytes) {
    console.error("Document row has no stored object", document.id, document.storageKey)
    throw new DocumentNotFoundError()
  }

  return { document, bytes }
}

/** The §8.6 disposition fallback: a generic stem plus the registry's extension,
 *  used when nothing of the user's filename survives sanitising. Falls back to
 *  a bare name for a type the registry no longer knows, which is served as an
 *  attachment anyway. */
export function downloadFallbackName(contentType: string): string {
  return `document${findContentType(contentType)?.extension ?? ""}`
}
