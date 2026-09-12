# Phase 2 — known debt carried forward

**Date:** 2026-09-12
**Status:** Phase 2 merged to `main`. These are deliberate deferrals, recorded so
they are not rediscovered as surprises.

Each item says what it is, why it was deferred, and where it belongs.

## Agreed with the product owner

### Table sorting
Spec §7 says the table is "sortable by company, role, status, and applied date".
Only status **filtering** shipped. Sorting needs URL-driven sort state, a
whitelist of sortable columns, and server-side ordering — a task's worth of work.
Deferred by explicit agreement on 2026-09-12: build without it, revisit once the
table has real use. **First candidate for a Phase 2.1 follow-up.**

## Robustness (Phase 7 hardening)

### A session referencing a deleted user is unrecoverable
Auth.js uses JWT sessions, so a token stays valid after its user row is gone.
Every Server Action then fails with the generic "Something went wrong" and nothing
tells the user to sign out. Hit for real on 2026-09-12 when the database was
swapped underneath a live session; it would also happen to anyone logged in when
their account is deleted.

**Fix:** in the `jwt`/`session` callback, drop a session whose user id no longer
resolves, so the app fails as "logged out" rather than "broken".

### Board cards are not keyboard-openable
Clicking a card opens the edit sheet, but Enter/Space starts a dnd-kit keyboard
drag instead. Not a regression — cards were entirely unopenable before Phase 2's
final fix wave — but keyboard users must use the Table view to edit.

**Fix:** likely `nativeButton={false}` on that `SheetTrigger`, which also silences
a dev-only Base UI console warning about an `<article>` being used as a trigger.
It enables Base UI's Enter/Space emulation, which must be checked against dnd-kit's
`KeyboardSensor` `onKeyDown` so the two do not fight.

## Cosmetic / consistency

- **Company `notes` caps at 500 characters, application `notes` at 2000.** Arbitrary
  divergence between `company-schemas.ts` and `application-schemas.ts`.
- **Deleting an application is only possible from the Table view** —
  `delete-application-dialog.tsx` is used solely by `application-table.tsx`.
- **Legacy `javascript:` URLs.** The protocol refine added in Phase 2 guards new
  writes; rows saved before it keep their value. The current database has none, so
  there is nothing to migrate today.
- **A narrow optimistic-drag race:** if a props re-sync lands mid-drag *and* the
  status write then fails, the revert targets the pre-re-sync snapshot until the
  next navigation.

## Process lesson for Phase 3

**Run `pnpm lint` in every task's verification step, not only the final one.**
Phase 2's plan verified each task with `tsc` and `build` but ran lint only in
Task 19. A real defect introduced in Task 13 — JSX constructed inside a
`try/catch`, where React render errors escape the catch entirely — survived six
further tasks before anything caught it.

A second instance of the same shape: `parseStatus` validating with
`value in ApplicationStatus` was recorded as a *Minor* during review and left
alone. The prototype chain makes `?status=toString` valid, which was harmless
until the status filter added an empty state that called
`STATUS_LABELS[statusFilter].toLowerCase()` — turning a parked Minor into a 500.
**A latent validation hole is only harmless until the next feature touches it.**
