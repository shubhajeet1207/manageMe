import { createLocalStorageDriver } from "./local-driver"
import { createS3StorageDriver, type S3DriverConfig } from "./s3-driver"
import type { StorageDriver } from "./storage"

export type { StorageDriver } from "./storage"
export { UnsafeStorageKeyError } from "./storage"

/**
 * Collects every missing variable before throwing, rather than stopping at
 * the first: a deploy that is missing three variables should say so once,
 * not send someone around the loop three separate times.
 */
function requireEnv(names: string[], driverLabel: string): void {
  const missing = names.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER is "${driverLabel}" but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set.`
    )
  }
}

/**
 * Cloudflare R2. Single-region by design, egress free at any volume — but
 * enabling it requires a card on file even for free-tier usage, which is why
 * `b2` exists as an alternative below.
 */
function readR2Config(): S3DriverConfig {
  const names = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]
  requireEnv(names, "r2")

  return {
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucket: process.env.R2_BUCKET!,
  }
}

/** Matches the exact string Backblaze's dashboard shows as the bucket's "S3
 *  compatible" endpoint, e.g. `https://s3.us-west-004.backblazeb2.com`. */
const B2_ENDPOINT_PATTERN = /^https:\/\/s3\.([a-z0-9-]+)\.backblazeb2\.com$/

/**
 * Backblaze B2's S3-compatible API. No card required to sign up, which is the
 * whole reason to reach for this over R2. Genuinely regional — unlike R2, the
 * SDK's region must match the bucket's actual region or signing fails.
 *
 * `B2_ENDPOINT` takes the full URL rather than a bare region name so the
 * value is a straight copy from the B2 dashboard: one fewer place to
 * transcribe a region code wrong. The region the SDK needs is parsed back out
 * of it, and a value that doesn't match the expected shape fails loudly
 * naming the variable, rather than signing with a guessed region and failing
 * every request with an opaque 403.
 */
function readB2Config(): S3DriverConfig {
  const names = ["B2_KEY_ID", "B2_APPLICATION_KEY", "B2_ENDPOINT", "B2_BUCKET"]
  requireEnv(names, "b2")

  const endpoint = process.env.B2_ENDPOINT!
  const match = endpoint.match(B2_ENDPOINT_PATTERN)
  if (!match) {
    throw new Error(
      `B2_ENDPOINT "${endpoint}" doesn't look like a Backblaze S3 endpoint. Expected ` +
        `https://s3.<region>.backblazeb2.com — copy it verbatim from the bucket's page ` +
        `in the B2 dashboard rather than typing it by hand.`
    )
  }

  return {
    endpoint,
    region: match[1],
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
    bucket: process.env.B2_BUCKET!,
  }
}

/**
 * Resolve the configured storage driver.
 *
 * An unknown value throws rather than silently falling back: a typo in a
 * deploy env should fail loudly, not write production resumes to a
 * container's ephemeral disk.
 */
export function getStorage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local"

  switch (driver) {
    case "local":
      return createLocalStorageDriver()
    case "r2":
      return createS3StorageDriver(readR2Config())
    case "b2":
      return createS3StorageDriver(readB2Config())
    default:
      throw new Error(`Unknown STORAGE_DRIVER "${driver}". Supported drivers: local, r2, b2.`)
  }
}
