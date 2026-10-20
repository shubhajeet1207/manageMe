"use client"

/**
 * Fires only when the root layout itself throws — the one failure app/error.tsx
 * cannot catch, because an error.tsx never wraps the layout in its own segment.
 * This component REPLACES the root layout, so it owns <html> and <body>.
 *
 * Replacing the root layout also means globals.css, next/font's fonts and
 * next-themes are all gone. Nothing here can use a Tailwind class or a CSS
 * variable from the app stylesheet, because no app stylesheet is loaded — hence
 * the self-contained <style> below, structured the same way Next's own built-in
 * global error is (client/components/builtin/global-error.js).
 *
 * The palette is COPIED from globals.css rather than referenced, and the theme
 * comes from prefers-color-scheme rather than the class next-themes writes:
 * that class goes on the <html> the root layout renders, and that <html> is
 * precisely what just failed. If the retro tokens in globals.css move, these are
 * the values to move with them.
 */

const css = `
*, *::before, *::after { box-sizing: border-box; }

:root {
  color-scheme: light dark;
  --ge-page: #fff4e7;        /* paper */
  --ge-card: #fffaf3;        /* window */
  --ge-text: #201a3a;        /* ink */
  --ge-subtle: #5c5266;      /* muted, 7.1:1 */
  --ge-subtlest: #665b70;
  --ge-border: #201a3a33;
  --ge-card-border: #201a3a; /* ink outline */
  --ge-shadow: #201a3a;
  --ge-bar: #f05b43;         /* coral title bar */
  --ge-cta: #f2b755;         /* gold button */
  --ge-on-cta: #201a3a;
  --ge-danger: #b3321f;
  --ge-ring: #c84431;
  --ge-hover: #f7e4dc;
}

@media (prefers-color-scheme: dark) {
  :root {
    --ge-page: #1a1530;
    --ge-card: #2a2346;
    --ge-text: #fff4e7;
    --ge-subtle: #d4c9e0;
    --ge-subtlest: #bfb2cf;
    --ge-border: #fff4e72e;
    --ge-card-border: #f4dccb;
    --ge-shadow: #0b0818;
    --ge-danger: #ff8f78;
    --ge-ring: #f2b755;
    --ge-hover: #3a3160;
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
  /* globals.css's --font-sans minus the next/font variables, which the root
     layout loads and so are not here. */
  font-family: "Trebuchet MS", "Segoe UI", ui-sans-serif, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.ge-card {
  width: 100%;
  max-width: 28rem;
  background: var(--ge-card);
  border: 2px solid var(--ge-card-border);
  box-shadow: 6px 6px 0 var(--ge-shadow);
}

.ge-bar {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  background: var(--ge-bar);
  border-bottom: 2px solid var(--ge-card-border);
}

.ge-bar span {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid #201a3a;
  background: #fffaf3;
}

.ge-content { padding: 24px; }

.ge-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: "Cascadia Code", Consolas, ui-monospace, Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ge-subtle);
}

.ge-dot {
  width: 10px;
  height: 10px;
  border: 2px solid var(--ge-card-border);
  background: var(--ge-danger);
}

.ge-title {
  margin: 12px 0 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.ge-body {
  margin: 6px 0 0;
  color: var(--ge-subtle);
}

.ge-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.ge-button {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 16px;
  border: 2px solid var(--ge-card-border);
  box-shadow: 3px 3px 0 var(--ge-shadow);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  background: var(--ge-cta);
  color: var(--ge-on-cta);
}

.ge-button:hover { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--ge-shadow); }

.ge-button--secondary {
  background: var(--ge-card);
  color: var(--ge-text);
}

.ge-button--secondary:hover { background: var(--ge-hover); }

.ge-button:focus-visible {
  outline: 3px solid var(--ge-ring);
  outline-offset: 2px;
}

.ge-reference {
  margin: 24px 0 0;
  padding-top: 16px;
  border-top: 2px dashed var(--ge-border);
  font-size: 12px;
  color: var(--ge-subtlest);
}

.ge-digest {
  font-family: "Cascadia Code", Consolas, ui-monospace, Menlo, monospace;
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
          <div aria-hidden className="ge-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="ge-content">
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
          </div>
        </main>
      </body>
    </html>
  )
}
