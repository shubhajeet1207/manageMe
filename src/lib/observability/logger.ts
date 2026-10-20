import { createHmac, randomUUID } from "node:crypto"

type LogLevel = "info" | "warn" | "error"
type LogFields = Record<string, unknown>
const SENSITIVE_KEY = /password|secret|token|authorization|cookie|email|username|filename|storagekey|notes|description|content|body|query|url|ipaddress|address/i

/** Logs contain operational metadata, never request bodies or raw exceptions. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]"
  if (value instanceof Error) return { name: value.name, code: safeCode(value) }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [
      key, SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1),
    ]))
  }
  if (typeof value === "string") {
    return value.replace(/https?:\/\/\S+/g, "[url]").replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]").slice(0, 300)
  }
  if (typeof value === "bigint") return value.toString()
  return value
}

function safeCode(error: Error): string | undefined {
  const code = (error as Error & { code?: unknown }).code
  return typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : undefined
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const record = { ...redact(fields) as LogFields, timestamp: new Date().toISOString(), level, event }
  console[level](JSON.stringify(record))
}

/** A rotating deploy secret keeps identifiers useful for correlation without logging PII. */
export function actorHash(userId: string): string {
  const secret = process.env.OBSERVABILITY_HASH_KEY ?? process.env.AUTH_SECRET
  return secret ? createHmac("sha256", secret).update(userId).digest("hex").slice(0, 20) : "anonymous"
}

export async function observe<T>(operation: string, work: () => Promise<T>, fields: LogFields = {}): Promise<T> {
  const started = performance.now()
  const traceId = randomUUID()
  try {
    const result = await work()
    logEvent("info", "operation.completed", { ...fields, operation, traceId, durationMs: Math.round(performance.now() - started) })
    return result
  } catch (error) {
    logEvent("error", "operation.failed", { ...fields, operation, traceId, durationMs: Math.round(performance.now() - started), error })
    throw error
  }
}
