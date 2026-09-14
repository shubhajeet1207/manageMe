import type { NextConfig } from "next"

/**
 * The Content-Security-Policy this app can actually run under.
 *
 * NO NONCE, deliberately. The nonce recipe in Next's own guide
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md)
 * generates the nonce in `src/proxy.ts`, and the cost it names is that EVERY
 * page becomes dynamically rendered — no static shell, no CDN caching, no PPR.
 * That is a whole-app rendering decision, not a header tweak. The same guide's
 * "Without Nonces" section is the supported alternative and is what this is.
 *
 * `'unsafe-inline'` in `script-src` is therefore load-bearing rather than
 * sloppy: Next inlines the RSC flight payload as `<script>self.__next_f.push(…)`
 * on every page, and next-themes inlines a pre-paint script in <head> to set the
 * theme class before first paint (without it the app flashes light on a dark
 * system). A `script-src 'self'` with neither nonce nor `'unsafe-inline'` does
 * not tighten this app, it blanks it.
 *
 * What the policy still buys, even so: no third-party script origin, no `eval`
 * in production, no `<base>` rewrite, no form posting off-origin, and no
 * embedding by another site.
 */
function contentSecurityPolicy(isProduction: boolean): string {
  return [
    "default-src 'self'",

    // See the note above: Next's inline flight payload and next-themes' inline
    // pre-paint script are both inline <script> tags with no nonce.
    // `'unsafe-eval'` is dev-only — React uses `eval` there to reconstruct
    // server stacks in the error overlay, and neither React nor Next uses it in
    // a production build.
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval' blob:"}`,

    // next/font/google inlines an @font-face <style> block, and both primitive
    // libraries in use here (Base UI and Radix) position floating elements with
    // inline `style` attributes, which `style-src-attr` inherits from this.
    "style-src 'self' 'unsafe-inline'",

    // 'self' covers /api/documents/[id]/file, which is how every uploaded image
    // is displayed (src/components/image-preview.tsx — a plain <img> against the
    // authorising route, never the optimizer). NOTE: User.image has no writer in
    // the app today; the day an external avatar source is added, its origin has
    // to appear here or avatars silently stop loading.
    "img-src 'self' data: blob:",

    // next/font self-hosts under /_next/static/media, so no external font origin.
    "font-src 'self' data:",

    // NOT 'none', which is the value every CSP guide reaches for first and the
    // one that breaks this app: src/components/pdf-preview.tsx renders every
    // resume and every PDF document in an <object data="/api/…/file">, and
    // <object> is exactly what object-src governs. 'self' keeps the browser's
    // native PDF viewer working while still refusing plugins from anywhere else.
    "object-src 'self'",
    // Chromium's PDF viewer loads inside a nested browsing context; frame-src
    // is what governs it there.
    "frame-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",

    // Server Actions POST back to this origin. `ws:`/`wss:` are dev-only: the
    // Turbopack dev server pushes HMR updates over a WebSocket, and without it
    // the page stops refreshing on save.
    `connect-src 'self'${isProduction ? "" : " ws: wss:"}`,

    "base-uri 'self'",
    "form-action 'self'",

    // 'self' rather than 'none', for the same reason as object-src: the PDF
    // preview embeds our own authorising route as a nested browsing context, and
    // 'none' refuses that too. Cross-origin framing — the clickjacking case this
    // directive exists for — is still refused.
    "frame-ancestors 'self'",

    // Production only. On http://localhost this is at best inert and at worst
    // upgrades a dev subresource fetch to a port nothing is listening on.
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ")
}

/**
 * The response headers applied to every route.
 *
 * `isProduction` is a PARAMETER rather than a read of `process.env.NODE_ENV`
 * inside the function, because the two directives that differ between dev and
 * production (HSTS, and the CSP's dev escape hatches) are the two most worth
 * asserting in both shapes — and under vitest `NODE_ENV` is "test", so a
 * function that read it directly could only ever be tested in one of them.
 */
export function securityHeaders(isProduction: boolean): { key: string; value: string }[] {
  return [
    {
      key: "Content-Security-Policy",
      value: contentSecurityPolicy(isProduction),
    },
    // Only meaningful over HTTPS, and actively hostile in dev: a browser that
    // records the policy for `localhost` will refuse plain http to it for two
    // years, across every other project on that port.
    //
    // `includeSubDomains; preload` is a commitment, not a formality: once a
    // browser has seen it, every subdomain of the deployment domain must serve
    // HTTPS, and submitting to the preload list makes that near-irreversible.
    // Correct for a domain this app owns outright; if it is ever deployed on a
    // subdomain of something shared, drop both tokens rather than the header.
    ...(isProduction
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]
      : []),
    // SAMEORIGIN, not DENY, and paired with `frame-ancestors 'self'` above for
    // browsers that honour one and not the other. DENY would refuse the PDF
    // preview's own <object> along with the attack it is aimed at.
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    // The concrete leak this closes: every external job posting is opened from
    // /applications/[id] with a plain <a href>, so the default policy handed the
    // job board the referring URL. `same-origin` sends the full path to us and
    // NOTHING at all cross-origin, so a company's careers page never learns that
    // a ManageMe resume or company id exists. Server Actions' CSRF check reads
    // Origin and Host, never Referer, so nothing here depends on the referrer.
    { key: "Referrer-Policy", value: "same-origin" },
    // This app asks for none of these. Listing them denies them to anything that
    // ends up embedded, including a PDF rendered by the browser's own viewer.
    {
      key: "Permissions-Policy",
      value: [
        "accelerometer=()",
        "autoplay=()",
        "camera=()",
        "display-capture=()",
        "encrypted-media=()",
        "geolocation=()",
        "gyroscope=()",
        "magnetometer=()",
        "microphone=()",
        "midi=()",
        "payment=()",
        "usb=()",
        "xr-spatial-tracking=()",
        // `fullscreen=(self)` rather than `()`: the native PDF viewer's own
        // fullscreen control lives in a nested context on this origin.
        "fullscreen=(self)",
      ].join(", "),
    },
    // Severs the reference a window opened from here (or one that opened this
    // one) would otherwise keep. There is no OAuth popup flow to break — the
    // only provider is Credentials.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // No other origin may load our bytes at all. src/server/files/file-response.ts
    // already set exactly this on the two upload-serving routes, which this block
    // deliberately does not cover; the effect of adding it here is that every
    // OTHER route gets the protection those two already had.
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    // Not in the brief, but the cheapest header here and the one that matters
    // most alongside user-uploaded bytes: it stops a browser sniffing a response
    // as HTML whatever its declared type says.
    { key: "X-Content-Type-Options", value: "nosniff" },
  ]
}

/**
 * Extra hosts whose `Origin` a Server Action may carry.
 *
 * Every mutation in this app is a Server Action, and Next's Origin-vs-Host
 * comparison is the ONLY CSRF control on them — there is no token. Behind a
 * reverse proxy that rewrites Host, that comparison fails on legitimate traffic,
 * and this list is what Next checks before rejecting (see `isCsrfOriginAllowed`
 * in next/dist/server/app-render/csrf-protection.js).
 *
 * It is derived from the canonical URL rather than hand-written, so it cannot
 * drift from the origin the app is actually served on. `URL.host` keeps the port,
 * which is what Next compares against (`new URL(originHeader).host`). A missing
 * or unparseable value yields an EMPTY list, which is the safe direction: Next
 * then accepts same-origin only.
 *
 * The URL is a PARAMETER, not a read of `process.env` inside the body: the one
 * case that has to be right is "nothing configured", and a default argument
 * would make that case unreachable from a test.
 */
export function serverActionAllowedOrigins(appUrl: string | undefined): string[] {
  if (!appUrl) return []
  try {
    const { host, protocol } = new URL(appUrl)
    if (protocol !== "http:" && protocol !== "https:") return []
    // Next treats `*.example.com` here as a real wildcard
    // (`matchWildcardDomain`), so a stray `*` in the canonical URL would widen
    // the CSRF escape hatch to every subdomain — silently, from a variable that
    // is meant to name ONE origin. A deployment that genuinely needs a wildcard
    // should say so here on purpose rather than inherit it from a public URL.
    if (!host || host.includes("*")) return []
    return [host]
  } catch {
    return []
  }
}

const nextConfig: NextConfig = {
  // Next 16 logs every incoming request in dev, arguments included — so a
  // Server Action call is printed to the terminal payload and all. For
  // `createCredentialAction`/`updateCredentialAction` that payload IS the
  // vault: a stored password, in plain text, in the dev server's own output.
  // The same logging printed a user's ManageMe account password at signup.
  // This is not a style preference: it must stay off, in every environment
  // this config applies to, or a credential typed into the form is a
  // credential typed into the log.
  // The floating dev-tools badge Next renders in the corner. Off by request:
  // it overlaps the sidebar's lower content and is not wanted while working.
  devIndicators: false,
  logging: {
    incomingRequests: false,
  },
  // `X-Powered-By: Next.js` on every response names the framework and nothing
  // else useful. It only ever helps whoever is deciding which exploits to try.
  poweredByHeader: false,
  experimental: {
    // Next 16 enforces TWO independent body-size limits before a request
    // reaches our code, and each is a separate footgun:
    //
    // - `serverActions.bodySizeLimit` governs the Server Actions body parser.
    //   Its default (1mb) rejects a real resume with an opaque framework
    //   error before validatePdfUpload ever runs.
    // - `proxyClientMaxBodySize` governs the proxy's cloned request stream,
    //   upstream of Server Actions entirely. Its default is exactly
    //   10485760 bytes (10MB) — see DEFAULT_BODY_CLONE_SIZE_LIMIT /
    //   getCloneableBody in next/dist/server/body-streams.js — and unlike the
    //   Server Actions limit, it does NOT reject an oversized request: it
    //   silently stops forwarding bytes past the limit (`p1.push(null)`),
    //   truncating the body. That produced a corrupt file on disk with a row
    //   in the database and no error anywhere.
    //
    // Both MUST stay set, and both MUST stay above MAX_UPLOAD_BYTES
    // (src/server/files/pdf.ts, currently 10MB) — a limit sitting at or below
    // that cap makes Next answer instead of our own
    // "This file is larger than 10MB" message (§4, §8.3). Raising one without
    // the other reintroduces exactly this bug. Matched to `serverActions` below.
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: serverActionAllowedOrigins(process.env.NEXT_PUBLIC_APP_URL),
    },
    proxyClientMaxBodySize: "12mb",
  },
  headers: async () => [
    {
      // Deliberately NOT applied to the two routes that serve user-uploaded
      // bytes. src/server/files/file-response.ts sets the §8.6 header set for
      // those responses itself — including a much tighter
      // `default-src 'none'; sandbox` — and its comment states the intent that
      // "the day a header needs adding, one file should change rather than two".
      // Letting this block reach them would either replace that policy with a
      // looser one or leave two definitions of it to drift apart.
      source: "/((?!api/documents/|api/resume-versions/).*)",
      headers: securityHeaders(process.env.NODE_ENV === "production"),
    },
  ],
}

export default nextConfig
