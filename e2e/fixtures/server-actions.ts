import { expect, type APIResponse, type Page } from "@playwright/test"

/**
 * Calling a Server Action with a payload the UI would never send.
 *
 * The point of these specs is the Server Action boundary: the unit suite calls
 * services directly, so everything between the browser and the service — the
 * Zod parse, the `auth()` call, the id that arrives as `unknown` — is only ever
 * exercised by a real POST. The two worst bugs this project has had (a body
 * truncated at 1MB that stored a corrupt upload, and an unvalidated delete id
 * that removed eight rows in one request) both lived exactly there.
 *
 * The UI cannot produce those payloads: the upload form refuses an oversized
 * file before the network, and no screen offers another user's row id. So a
 * test drives the real control once to learn which action it fires, then calls
 * that same action again with arguments of its own.
 *
 * The action id is never hardcoded. It is a content hash Next recomputes on
 * every build, so a literal would rot into a 404 that reads as a pass — which
 * is why `actionResponseText` fails loudly on any status but 200.
 */
export type ServerAction = {
  /** The page URL the action posts to — Next routes by the header, not this. */
  url: string
  /** The `Next-Action` id, learned from a real request. */
  id: string
}

/**
 * Runs `trigger` (a click that fires a Server Action) and returns the action it
 * fired. The listener is armed before the trigger runs, so a fast action cannot
 * complete before anything is watching.
 */
export async function captureServerAction(
  page: Page,
  trigger: () => Promise<void>
): Promise<ServerAction> {
  const request = page.waitForRequest(
    (candidate) =>
      candidate.method() === "POST" && candidate.headers()["next-action"] !== undefined
  )
  await trigger()
  const captured = await request
  const id = captured.headers()["next-action"]
  expect(id, "the interaction did not fire a Server Action").toBeTruthy()
  return { url: captured.url(), id }
}

/**
 * Calls the action with `args`, as the browser context's signed-in user —
 * `page.request` shares that context's cookie jar, which is what makes "user B
 * calls this with user A's id" a request from user B rather than an anonymous
 * one.
 *
 * The wire format is React's encoding of a plain JSON call: the argument list
 * as JSON, `text/plain`. Captured from a real request rather than assumed.
 * `origin` is required — Next 16 compares it against the host and answers 403
 * when they disagree.
 */
export async function callServerAction(
  page: Page,
  action: ServerAction,
  args: unknown[]
): Promise<APIResponse> {
  return page.request.post(action.url, {
    headers: {
      "next-action": action.id,
      accept: "text/x-component",
      origin: new URL(action.url).origin,
      "content-type": "text/plain;charset=UTF-8",
    },
    data: JSON.stringify(args),
  })
}

/**
 * A Server Action's response is a React Flight stream, not JSON. The
 * `ActionResult` this app returns is embedded in it verbatim, so "the refusal
 * carried this message" is a substring check against the decoded stream — while
 * "the write did or did not happen" is always asserted against the database.
 */
export async function actionResponseText(response: APIResponse): Promise<string> {
  expect(
    response.status(),
    "the Server Action itself failed — a 404 here usually means the captured action id no longer matches the running build"
  ).toBe(200)
  return response.text()
}

/**
 * The upload path needs more than an action id. A file only crosses the
 * boundary inside FormData, and React encodes a FormData argument as a flat set
 * of prefixed parts plus a reference entry that reassembles them — an internal
 * format that a test has no business reimplementing.
 *
 * So the page keeps the last FormData it actually sent, and the replay below
 * re-sends THAT, with one part swapped. The encoding is therefore whatever the
 * running React produces, and the only difference between the real upload and
 * the replay is the bytes being tested.
 *
 * Must be called before the page navigates: an init script runs on every
 * document, but the recorded request lives on `window` and resets with it.
 */
export async function recordServerActionRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as {
      __lastAction?: { url: string; id: string; body: unknown }
    }
    const originalFetch = window.fetch
    window.fetch = function patched(input: RequestInfo | URL, init?: RequestInit) {
      const id = new Headers(init?.headers as HeadersInit | undefined).get("next-action")
      if (id) store.__lastAction = { url: String(input), id, body: init?.body }
      return originalFetch.call(this, input as RequestInfo, init)
    }
  })
}

export type ReplayedUpload = { status: number; body: string }

/**
 * Re-sends the last recorded upload from inside the page, with the file part
 * replaced and any named metadata field overridden. The request carries the
 * session cookie and a same-origin `Origin` header because the browser makes
 * it, exactly as the form's own request did.
 *
 * `content` + `padToBytes` build the replacement deterministically, so a test
 * can hash the same bytes in Node and prove the file came back whole.
 */
export async function replayUploadAction(
  page: Page,
  options: {
    fields?: Record<string, string>
    filename: string
    mimeType: string
    content: string
    /** Pad with spaces to exactly this many bytes. Omitted, `content` is all. */
    padToBytes?: number
  }
): Promise<ReplayedUpload> {
  return page.evaluate(async (input) => {
    const store = window as unknown as {
      __lastAction?: { url: string; id: string; body: unknown }
    }
    const last = store.__lastAction
    if (!last) throw new Error("no Server Action has been recorded on this document")
    if (!(last.body instanceof FormData)) {
      throw new Error("the last recorded Server Action did not carry FormData")
    }

    const head = new TextEncoder().encode(input.content)
    const parts: BlobPart[] = [head]
    if (input.padToBytes !== undefined) {
      if (input.padToBytes < head.byteLength) throw new Error("padToBytes is below the content")
      parts.push(new Uint8Array(input.padToBytes - head.byteLength).fill(0x20))
    }
    const replacement = new File(parts, input.filename, { type: input.mimeType })

    // The part names carry React's own prefix ("_1_title" and so on). It is
    // derived from the recorded request rather than hardcoded, so a React
    // upgrade that renumbers the parts does not silently send fields nothing
    // reads.
    let prefix: string | null = null
    let fileKey: string | null = null
    last.body.forEach((value, key) => {
      if (key.endsWith("_title")) prefix = key.slice(0, key.length - "title".length)
      if (value instanceof File) fileKey = key
    })
    if (fileKey === null) throw new Error("the recorded FormData had no file part")

    const replay = new FormData()
    last.body.forEach((value, key) => {
      if (key === fileKey) replay.append(key, replacement, input.filename)
      else replay.append(key, value)
    })
    for (const [field, value] of Object.entries(input.fields ?? {})) {
      if (prefix === null) throw new Error("could not derive the part-name prefix")
      replay.set(`${prefix}${field}`, value)
    }

    const response = await fetch(last.url, {
      method: "POST",
      headers: { "next-action": last.id, accept: "text/x-component" },
      body: replay,
    })
    return { status: response.status, body: await response.text() }
  }, options)
}
