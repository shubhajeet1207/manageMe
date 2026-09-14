import { createLocalStorageDriver } from "./local-driver"
import { createR2StorageDriver } from "./r2-driver"
import type { StorageDriver } from "./storage"

export type { StorageDriver } from "./storage"
export { UnsafeStorageKeyError } from "./storage"

/**
 * Resolve the configured storage driver.
 *
 * An unknown value throws rather than silently falling back: a typo in a
 * deploy env should fail loudly, not write production resumes to a
 * container's ephemeral disk. Phase 7's cloud driver is one more `case`.
 */
export function getStorage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local"

  switch (driver) {
    case "local":
      return createLocalStorageDriver()
    case "r2":
      return createR2StorageDriver()
    default:
      throw new Error(`Unknown STORAGE_DRIVER "${driver}". Supported drivers: local, r2.`)
  }
}
