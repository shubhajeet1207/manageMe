import { afterEach, describe, expect, it } from "vitest"
import { getStorage } from "./index"

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

  it("throws on an unknown driver rather than silently falling back", () => {
    // A typo in a deploy env must fail loudly, not write production resumes
    // to a container's ephemeral disk.
    process.env.STORAGE_DRIVER = "s4"
    expect(() => getStorage()).toThrow(/STORAGE_DRIVER/)
  })
})
