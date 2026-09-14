"use client"

/**
 * Fires only when the root layout itself throws — the one failure app/error.tsx
 * cannot catch, because an error.tsx never wraps the layout in its own segment.
 * This component REPLACES the root layout, so it owns <html> and <body>.
 *
 * Replacing the root layout also means globals.css, next/font's Inter and
 * next-themes are all gone. Nothing here can use a Tailwind class or a CSS
 * variable from the app stylesheet, because no app stylesheet is loaded — hence
 * the self-contained <style> below, structured the same way Next's own built-in
 * global error is (client/components/builtin/global-error.js).
 *
 * The palette is COPIED from globals.css rather than referenced, and the theme
 * comes from prefers-color-scheme rather than the class next-themes writes:
 * that class goes on the <html> the root layout renders, and that <html> is
 * precisely what just failed. If the ADS tokens in globals.css move, these are
 * the values to move with them.
 */

const css = `
*, *::before, *::after { box-sizing: border-box; }

:root {
  color-scheme: light dark;
  --ge-page: #f8f8f8;        /* elevation.surface.sunken */
  --ge-card: #ffffff;        /* elevation.surface.raised */
  --ge-text: #292a2e;        /* color.text */
  --ge-subtle: #505258;      /* color.text.subtle */
  --ge-subtlest: #6b6e76;    /* color.text.subtlest */
  --ge-border: #0b120e24;    /* color.border — translucent on purpose */
  --ge-card-border: #0b120e85;
  --ge-brand: #1868db;       /* color.background.brand.bold */
  --ge-on-brand: #ffffff;    /* color.text.inverse */
  --ge-danger: #c9372c;      /* color.background.danger.bold */
  --ge-ring: #4688ec;        /* color.border.focused */
  --ge-hover: #f0f1f2;       /* elevation.surface.hovered */
}

@media (prefers-color-scheme: dark) {
  :root {
    --ge-page: #18191a;
    --ge-card: #242528;
    --ge-text: #cecfd2;
    --ge-subtle: #a9abaf;
    --ge-subtlest: #96999e;
    --ge-border: #e3e4f21f;
    --ge-card-border: #e3e4f266;
    --ge-brand: #669df1;
    --ge-on-brand: #1f1f21;
    --ge-danger: #f87168;
    --ge-ring: #8fb8f6;
    --ge-hover: #303134;
  }
}

body {
  margin: 0;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--ge-page);
  color: var(--ge-text);
  /* globals.css's --font-sans minus the Inter variable, which is loaded by the
     root layout and so is not here. */
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu,
    "Helvetica Neue", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.ge-card {
  width: 100%;
  max-width: 28rem;
  padding: 24px;
  background: var(--ge-card);
  border: 1px solid var(--ge-card-border);
  border-radius: 12px;
  box-shadow: 0 1px 1px #1e1f2140, 0 0 1px #1e1f214f;
}

.ge-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--ge-subtle);
}

.ge-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--ge-danger);
}

.ge-title {
  margin: 12px 0 0;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.ge-body {
  margin: 6px 0 0;
  color: var(--ge-subtle);
}

.ge-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}

.ge-button {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 16px;
  border-radius: 6px;
  border: 1px solid transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  background: var(--ge-brand);
  color: var(--ge-on-brand);
}

.ge-button--secondary {
  background: transparent;
  color: var(--ge-text);
  border-color: var(--ge-card-border);
}

.ge-button--secondary:hover { background: var(--ge-hover); }

.ge-button:focus-visible {
  outline: none;
  border-color: var(--ge-ring);
  box-shadow: 0 0 0 3px var(--ge-ring);
}

.ge-reference {
  margin: 24px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--ge-border);
  font-size: 12px;
  color: var(--ge-subtlest);
}

.ge-digest {
  font-family: ui-monospace, Menlo, "Segoe UI Mono", "Ubuntu Mono", monospace;
}
`

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  // `retry`, not `reset`. The global boundary is mounted inside the app router's
  // context provider (client/components/app-router.js), so router.refresh() does
  // reach it and the document is genuinely re-rendered rather than re-drawn from
  // the payload that already failed.
  retry: () => void
}) {
  return (
    <html lang="en">
      <head>
        {/* React 19 renders <title> here without a metadata export, which a
            Client Component cannot have. */}
        <title>Something went wrong · ManageMe</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main className="ge-card">
          <p className="ge-eyebrow">
            <span aria-hidden className="ge-dot" />
            Error
          </p>
          <h1 className="ge-title">ManageMe didn&apos;t load</h1>
          <p className="ge-body">
            The failure is below the whole app, not in one page, so nothing here is worth
            navigating around. Trying again rebuilds the page from the server.
          </p>
          <div className="ge-actions">
            <button type="button" className="ge-button" onClick={retry}>
              Try again
            </button>
            {/* A plain anchor, not next/link: a soft navigation would re-render
                the same broken root layout in the same document. This is a full
                document load, which is the second, independent way out. */}
            <a className="ge-button ge-button--secondary" href="/dashboard">
              Go to dashboard
            </a>
          </div>
          {/* The digest, never error.message: the message is the original text
              for anything thrown on the client and would print database and
              filesystem detail onto the screen. */}
          {error.digest ? (
            <p className="ge-reference">
              Reference <span className="ge-digest">{error.digest}</span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
