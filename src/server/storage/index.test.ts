import { afterEach, describe, expect, it } from "vitest"
import { getStorage } from "./index"
import { SUPPORTED_STORAGE_DRIVERS } from "@/lib/env"

const original = process.env.STORAGE_DRIVER

afterEach(() => {
  if (original === undefined) delete process.env.STORAGE_DRIVER
  else process.env.STORAGE_DRIVER = original
})

describe("getStorage", () => {
  it("defaults to the local driver when STORAGE_DRIVER is unset", async () => {
    delete process.env.STORAGE_DRIVER
    // The local driver is identified by its answer, not by being truthy: its
    // objects live outside the web root and have no addressable URL.
    expect(await getStorage().url("resumes/u/a.pdf")).toBeNull()
  })

  it("returns the local driver for STORAGE_DRIVER=local", async () => {
    process.env.STORAGE_DRIVER = "local"
    // The local driver's objects live outside the web root and have no URL.
    expect(await getStorage().url("resumes/u/a.pdf")).toBeNull()
  })

  /**
   * The regression guard. `SUPPORTED_STORAGE_DRIVERS` is what the boot
   * validator accepts and this switch is what can actually be built; they
   * drifted once — `r2` and `b2` worked here while the validator still listed
   * only `local`, so a correct deploy failed at boot with "not a supported
   * driver". Asserting every listed driver constructs means the next one
   * cannot ship half-wired.
   */
  it.each(SUPPORTED_STORAGE_DRIVERS)("can actually construct the supported driver %s", (driver) => {
    process.env.STORAGE_DRIVER = driver
    // Give every provider its variables; the irrelevant ones are ignored.
    process.env.R2_ACCOUNT_ID = "acct"
    process.env.R2_ACCESS_KEY_ID = "key"
    process.env.R2_SECRET_ACCESS_KEY = "secret"
    process.env.R2_BUCKET = "bucket"
    process.env.B2_KEY_ID = "key"
    process.env.B2_APPLICATION_KEY = "secret"
    process.env.B2_ENDPOINT = "https://s3.us-west-004.backblazeb2.com"
    process.env.B2_BUCKET = "bucket"

    expect(() => getStorage()).not.toThrow()
  })

  it("throws on an unknown driver rather than silently falling back", () => {
    // A typo in a deploy env must fail loudly, not write production resumes
    // to a container's ephemeral disk.
    process.env.STORAGE_DRIVER = "s4"
    expect(() => getStorage()).toThrow(/STORAGE_DRIVER/)
  })

  it("names the R2 variable that is missing, rather than failing at first upload", () => {
    // The whole point of constructing the driver eagerly: a deploy with one
    // unset variable should break where someone is watching, not days later
    // when a user first attaches a resume.
    process.env.STORAGE_DRIVER = "r2"
    for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
      delete process.env[key]
    }
    expect(() => getStorage()).toThrow(/R2_ACCOUNT_ID/)
  })

  it("builds the R2 driver when every variable is present", async () => {
    process.env.STORAGE_DRIVER = "r2"
    process.env.R2_ACCOUNT_ID = "acct"
    process.env.R2_ACCESS_KEY_ID = "key"
    process.env.R2_SECRET_ACCESS_KEY = "secret"
    process.env.R2_BUCKET = "bucket"

    // Identified by its answer, the inverse of the local driver's: R2 CAN sign,
    // and the signature is what lets a >4.5MB file leave a Vercel function.
    const signed = await getStorage().url("resumes/u/a.pdf")
    expect(signed).toContain("acct.r2.cloudflarestorage.com")
    expect(signed).toContain("X-Amz-Signature")
  })

  it("refuses to sign a traversing key", async () => {
    process.env.STORAGE_DRIVER = "r2"
    process.env.R2_ACCOUNT_ID = "acct"
    process.env.R2_ACCESS_KEY_ID = "key"
    process.env.R2_SECRET_ACCESS_KEY = "secret"
    process.env.R2_BUCKET = "bucket"

    // The key gates are shared with the local driver precisely so a second
    // driver cannot quietly ship without them.
    await expect(getStorage().url("../../etc/passwd")).rejects.toThrow()
  })

  it("names the B2 variable that is missing, rather than failing at first upload", () => {
    process.env.STORAGE_DRIVER = "b2"
    for (const key of ["B2_KEY_ID", "B2_APPLICATION_KEY", "B2_ENDPOINT", "B2_BUCKET"]) {
      delete process.env[key]
    }
    expect(() => getStorage()).toThrow(/B2_KEY_ID/)
  })

  it("rejects a B2_ENDPOINT that isn't Backblaze's S3-compatible shape", () => {
    // A wrong region signs with the wrong region and every request fails with
    // an opaque 403 — this must fail at construction instead, naming the
    // variable, not the symptom three requests later.
    process.env.STORAGE_DRIVER = "b2"
    process.env.B2_KEY_ID = "key"
    process.env.B2_APPLICATION_KEY = "secret"
    process.env.B2_ENDPOINT = "https://backblazeb2.com/us-west-004"
    process.env.B2_BUCKET = "bucket"
    expect(() => getStorage()).toThrow(/B2_ENDPOINT/)
  })

  it("builds the B2 driver when every variable is present", async () => {
    process.env.STORAGE_DRIVER = "b2"
    process.env.B2_KEY_ID = "key"
    process.env.B2_APPLICATION_KEY = "secret"
    process.env.B2_ENDPOINT = "https://s3.us-west-004.backblazeb2.com"
    process.env.B2_BUCKET = "bucket"

    const signed = await getStorage().url("resumes/u/a.pdf")
    expect(signed).toContain("s3.us-west-004.backblazeb2.com")
    expect(signed).toContain("X-Amz-Signature")
  })

  it("refuses to sign a traversing key on B2 too", async () => {
    process.env.STORAGE_DRIVER = "b2"
    process.env.B2_KEY_ID = "key"
    process.env.B2_APPLICATION_KEY = "secret"
    process.env.B2_ENDPOINT = "https://s3.us-west-004.backblazeb2.com"
    process.env.B2_BUCKET = "bucket"

    await expect(getStorage().url("../../etc/passwd")).rejects.toThrow()
  })
})
