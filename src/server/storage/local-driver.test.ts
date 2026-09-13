import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { access, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createLocalStorageDriver, resolveStorageKey } from "./local-driver"
import { UnsafeStorageKeyError } from "./storage"

let root: string
let driver: ReturnType<typeof createLocalStorageDriver>

const KEY = "resumes/user-1/0f1e2d3c.pdf"
const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "manageme-storage-"))
  driver = createLocalStorageDriver(root)
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("localStorageDriver round-trip", () => {
  it("writes bytes that read back identically", async () => {
    await driver.put(KEY, BYTES, "application/pdf")
    const read = await driver.get(KEY)
    expect(read).not.toBeNull()
    expect(Array.from(read!)).toEqual(Array.from(BYTES))
  })

  it("creates nested directories for the key", async () => {
    await driver.put("resumes/user-2/deep/a.pdf", BYTES, "application/pdf")
    await expect(access(path.join(root, "resumes/user-2/deep/a.pdf"))).resolves.toBeUndefined()
  })

  it("overwrites an existing object at the same key", async () => {
    await driver.put("resumes/user-1/overwrite.pdf", BYTES, "application/pdf")
    const next = new Uint8Array([1, 2, 3])
    await driver.put("resumes/user-1/overwrite.pdf", next, "application/pdf")
    expect(Array.from((await driver.get("resumes/user-1/overwrite.pdf"))!)).toEqual([1, 2, 3])
  })

  it("returns null for a key that has no object", async () => {
    expect(await driver.get("resumes/user-1/missing.pdf")).toBeNull()
  })

  it("removes an object", async () => {
    await driver.put("resumes/user-1/doomed.pdf", BYTES, "application/pdf")
    await driver.remove("resumes/user-1/doomed.pdf")
    expect(await driver.get("resumes/user-1/doomed.pdf")).toBeNull()
  })

  it("is idempotent when removing an absent key", async () => {
    await expect(driver.remove("resumes/user-1/never-existed.pdf")).resolves.toBeUndefined()
  })

  it("has no addressable URL: url() always resolves to null", async () => {
    expect(await driver.url(KEY)).toBeNull()
  })
})

describe("storage key safety", () => {
  // Every one of these is a path-traversal or key-injection attempt. The
  // driver must refuse each of them rather than resolve it.
  const unsafeKeys = [
    "../../etc/passwd",
    "resumes/../../x.pdf",
    "/etc/passwd",
    "..\\windows\\x.pdf",
    "resumes/%2e%2e/x.pdf",
    "a\0b.pdf",
    "",
    "resumes/user-1/no-extension",
    "./x.pdf",
    "resumes//x.pdf",
    " leading-space.pdf",
    "resumes/user-1/x.pdf\n",
  ]

  for (const key of unsafeKeys) {
    it(`refuses put/get/remove for ${JSON.stringify(key)}`, async () => {
      await expect(driver.put(key, BYTES, "application/pdf")).rejects.toBeInstanceOf(
        UnsafeStorageKeyError
      )
      await expect(driver.get(key)).rejects.toBeInstanceOf(UnsafeStorageKeyError)
      await expect(driver.remove(key)).rejects.toBeInstanceOf(UnsafeStorageKeyError)
    })
  }

  it("writes nothing outside the root when a traversing key is refused", async () => {
    const escaped = path.join(path.dirname(root), "escaped.pdf")
    await rm(escaped, { force: true })
    await expect(driver.put("../escaped.pdf", BYTES, "application/pdf")).rejects.toBeInstanceOf(
      UnsafeStorageKeyError
    )
    await expect(access(escaped)).rejects.toThrow()
  })

  it("does not read a file outside the root through a refused key", async () => {
    const outside = path.join(path.dirname(root), "outside-secret.txt")
    await writeFile(outside, "secret")
    try {
      await expect(driver.get("../outside-secret.txt")).rejects.toBeInstanceOf(
        UnsafeStorageKeyError
      )
    } finally {
      await rm(outside, { force: true })
    }
  })

  it("resolves a legitimate key to a path inside the root", () => {
    const resolved = resolveStorageKey(root, KEY)
    expect(resolved).toBe(path.join(root, "resumes", "user-1", "0f1e2d3c.pdf"))
    expect(resolved.startsWith(path.resolve(root) + path.sep)).toBe(true)
  })

  it("refuses a legitimate-looking key that resolves outside the root", () => {
    expect(() => resolveStorageKey(root, "resumes/../../outside.pdf")).toThrow(
      UnsafeStorageKeyError
    )
  })
})
