import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { UnsafeStorageKeyError, type StorageDriver } from "./storage"

/**
 * The whole key must match this: it admits no `.`-only segments, no
 * backslash, no NUL, no `%`, no whitespace, no leading `/`, and exactly one
 * dot — the extension's. `..` therefore cannot appear anywhere, because the
 * middle character class has no `.` in it.
 */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_-]*\.[A-Za-z0-9]+$/

/**
 * Resolve `key` to an absolute path inside `root`, refusing anything that is
 * not a plain relative object key (§8.1, Control 2).
 *
 * Three independent gates, in order: the pattern above, an explicit
 * segment check, and then — belt and braces — the resolved path must still
 * sit under the root. The third can only fire if the first two are ever
 * loosened, which is exactly when it is wanted.
 */
export function resolveStorageKey(root: string, key: string): string {
  if (!SAFE_KEY.test(key)) throw new UnsafeStorageKeyError()

  const segments = key.split("/")
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new UnsafeStorageKeyError()
  }

  const base = path.resolve(root)
  const resolved = path.resolve(base, key)
  if (!resolved.startsWith(base + path.sep)) throw new UnsafeStorageKeyError()

  return resolved
}

/** The storage root: `UPLOADS_DIR` (default `.uploads`) under `process.cwd()`. */
export function localStorageRoot(): string {
  return path.resolve(process.cwd(), process.env.UPLOADS_DIR ?? ".uploads")
}

/**
 * Writes under a gitignored directory that is **not** inside `public/` and not
 * inside the Next.js route tree, so no static path serves these bytes. The
 * only way they leave the server is the authorising route in §8.4.
 */
export function createLocalStorageDriver(root: string = localStorageRoot()): StorageDriver {
  const base = path.resolve(root)

  return {
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
      const file = resolveStorageKey(base, key)
      // `contentType` is ignored here: a cloud driver must set it on the
      // object at write time, but a local file has nowhere to put it. The
      // `ResumeVersion` row is the single source of truth for metadata.
      void contentType
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
      // 0o600: the object is readable by the server process and nothing else.
      await writeFile(file, bytes, { mode: 0o600 })
    },

    async get(key: string): Promise<Uint8Array | null> {
      const file = resolveStorageKey(base, key)
      try {
        // Copy out of the Buffer: Node pools Buffer memory, and callers get a
        // plain Uint8Array with no view into a shared pool.
        return new Uint8Array(await readFile(file))
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null
        throw error
      }
    },

    async remove(key: string): Promise<void> {
      const file = resolveStorageKey(base, key)
      await rm(file, { force: true })
    },

    async url(): Promise<string | null> {
      // A local file has no URL. Returning null is the honest answer, and the
      // §8.4 route is the single place a Phase 7 signed URL would be used.
      return null
    },
  }
}
