import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { assertSafeStorageKey, type StorageDriver } from "./storage"

/**
 * One driver for every S3-compatible provider this app supports. The
 * provider-specific parts — which env vars, how the endpoint is built, which
 * region the SDK is told to sign with — live in `index.ts`, one function per
 * provider; this file only ever sees a fully-resolved config and does not
 * know or care which provider it is talking to.
 *
 * Written for Vercel first, where the local driver cannot work at all: a
 * serverless filesystem is ephemeral and per-invocation, so `.uploads` would
 * vanish between the write and the read.
 */

/** Signed URLs are short-lived: long enough to follow a redirect or finish an
 *  upload on a slow connection, short enough that a leaked URL in a referrer
 *  header or a browser history is not a durable grant. */
const DOWNLOAD_TTL_SECONDS = 300
const UPLOAD_TTL_SECONDS = 600

export type S3DriverConfig = {
  endpoint: string
  /** Load-bearing for a genuinely regional provider (Backblaze B2): the SDK
   *  signs the request with this and a mismatch against the endpoint's own
   *  region fails auth. R2 is single-region by design and ignores the value,
   *  but the SDK still refuses to sign with none supplied. */
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export function createS3StorageDriver(config: S3DriverConfig): StorageDriver {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
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

/** Every provider tested against answers a missing key with NoSuchKey, or a
 *  bare 404 on a HEAD-like path — this is what the S3 API itself specifies,
 *  not a Cloudflare-specific behaviour. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404
}
