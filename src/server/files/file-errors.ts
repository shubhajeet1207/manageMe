import { MAX_UPLOAD_MB } from "./content-types"

/**
 * The two upload failures both the resume path and the document vault raise.
 *
 * They live here rather than in `resume-service.ts` because importing them from
 * one service into another would be a dependency pointing the wrong way.
 * `resume-service.ts` re-exports them so every existing import site is
 * unchanged.
 */

export class FileTooLargeError extends Error {
  constructor() {
    super(`This file is larger than ${MAX_UPLOAD_MB}MB.`)
    this.name = "FileTooLargeError"
  }
}

/** A storage failure the user can do nothing about. Its message is generic on
 *  purpose: a Node `ENOENT` or `EACCES` carries an absolute path, and no
 *  filesystem path ever reaches the client (§12.2). */
export class StorageError extends Error {
  constructor() {
    // Names the step that failed without naming the cause. "Something went
    // wrong" was indistinguishable from every other failure in the app, so a
    // misconfigured storage backend and a validation slip read identically to
    // the user and to whoever they reported it to. Which provider, which
    // bucket, and which host could not be resolved stay in the server log
    // where they belong.
    super("We couldn't save that file. Please try again.")
    this.name = "StorageError"
  }
}
