import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { assertSafeStorageKey, type StorageDriver } from "./storage"

/**
 * Cloudflare R2, which speaks S3. Written for Vercel, where the local driver
 * cannot work at all: a serverless filesystem is ephemeral and per-invocation,
 * so `.uploads` would vanish between the write and the read.
 *
 * R2 rather than S3 for the egress bill, and rather than Vercel Blob so the
 * bytes are not tied to the host we happen to deploy on today.
 */

/** Signed URLs are short-lived: long enough to follow a redirect or finish an
 *  upload on a slow connection, short enough that a leaked URL in a referrer
 *  header or a browser history is not a durable grant. */
const DOWNLOAD_TTL_SECONDS = 300
const UPLOAD_TTL_SECONDS = 600

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

/**
 * Read config from the environment, naming the exact variable that is missing.
 * This throws at driver construction rather than at first upload: a deploy with
 * a typo in one variable should fail where someone is watching, not three days
 * later when a user tries to attach a resume.
 */
function readConfig(): R2Config {
  const required = {
    accountId: "R2_ACCOUNT_ID",
    accessKeyId: "R2_ACCESS_KEY_ID",
    secretAccessKey: "R2_SECRET_ACCESS_KEY",
    bucket: "R2_BUCKET",
  } as const

  const missing = Object.values(required).filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER is "r2" but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set.`
    )
  }

  return {
    accountId: process.env[required.accountId]!,
    accessKeyId: process.env[required.accessKeyId]!,
    secretAccessKey: process.env[required.secretAccessKey]!,
    bucket: process.env[required.bucket]!,
  }
}

export function createR2StorageDriver(config: R2Config = readConfig()): StorageDriver {
  const client = new S3Client({
    // R2 is single-region by design and ignores this, but the SDK refuses to
    // sign without one.
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
  const Bucket = config.bucket

  return {
    async put(key, bytes, contentType) {
      assertSafeStorageKey(key)
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: contentType })
      )
    },

    async get(key) {
      assertSafeStorageKey(key)
      try {
        const result = await client.send(new GetObjectCommand({ Bucket, Key: key }))
        if (!result.Body) return null
        // transformToByteArray is the SDK's own stream collector; reading the
        // stream by hand here would duplicate it and get the encoding wrong.
        return await result.Body.transformToByteArray()
      } catch (error) {
        // A missing object is not an error to this interface — `get` returns
        // null — but every other failure must surface rather than be swallowed
        // into "the file isn't there", which would read as data loss.
        if (isNotFound(error)) return null
        throw error
      }
    },

    async remove(key) {
      assertSafeStorageKey(key)
      // S3 delete is already idempotent: deleting an absent key succeeds.
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
    },

    async url(key, options) {
      assertSafeStorageKey(key)
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          // Signed into the URL, so they cannot be tampered with by whoever
          // holds it. This is how the redirect keeps the Content-Type and
          // filename the serving route would have set itself.
          ResponseContentType: options?.contentType,
          ResponseContentDisposition: options?.disposition,
          ResponseCacheControl: "private, no-store",
        }),
        { expiresIn: DOWNLOAD_TTL_SECONDS }
      )
    },

    async presignPut(key, contentType) {
      assertSafeStorageKey(key)
      // ContentType is bound into the signature, so the browser must send the
      // same value it asked for. That is not a security control on its own —
      // the caller still verifies magic bytes after the upload lands — but it
      // stops the object being stored with a type nobody declared.
      return getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), {
        expiresIn: UPLOAD_TTL_SECONDS,
      })
    },
  }
}

/** R2 answers a missing key with NoSuchKey, or a bare 404 on a HEAD-like path. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404
}
