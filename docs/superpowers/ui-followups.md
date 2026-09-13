# Outstanding UI findings after commit b2c1cbe

From the three verification lenses on the first refresh pass. The Atlassian
palette pass (in flight) is a **recolour** and will not fix the structural ones.

## Layout / interaction — survive any palette change

1. **The 7-column grid kicks in at `lg` (1024px), which is too early.**
   At 1024–1280 the columns are ~96px: card titles break mid-syllable
   ("Northw/ind/Syste/ms"), the Rejected header truncates to "REJEC…".
   Move the grid to `xl:` or `2xl:` and let the scroller cover the gap.
   `src/app/(app)/applications/application-board.tsx`

2. **No `<DragOverlay>`.** The dragged card is transformed in place at
   `opacity-70`, so at 155px column width its text overprints the card
   beneath into an unreadable smear. Add a DragOverlay, or at minimum
   z-index + full opacity on the dragged card.

3. **`loading.tsx` skeleton overflows.** It has seven `w-64 shrink-0`
   children (1864px) but not the board's scroller classes, so the skeleton
   pushes the document wider than the viewport — the same failure mode that
   previously made dnd-kit drop cards in the wrong column.
   Needs `flex gap-3 overflow-x-auto pb-3 lg:grid …` and `lg:min-w-0`.
   `src/app/(app)/applications/loading.tsx:13,15`

4. **2px of stage colour is invisible at a glance.** Fourteen pixels of hue
   across a 1136px board does not read as a spectrum in peripheral vision.
   Consider a left border, a tinted well per stage, or a faint card tint.

5. **Settings → Appearance was skipped** by the refresh — a bare
   "Theme: dark" outline button that cycles. The only screen the treatment
   visibly missed.

## Accessibility — structural, independent of palette

6. **The card body button has no `focus-visible` style at all.** Keyboard
   users get only Chrome's UA outline tinted to a weak blue (2.08:1).

7. **Focus ring is `ring/50` throughout** — 2.03–2.16:1 against the new
   surfaces. Needs `ring/75` (≈3.1:1) or a solid ring (≈4.9:1).
   `src/app/globals.css:152`, `ui/button.tsx:8`, `ui/select.tsx:39`

8. **Drag handle icon at `text-muted-foreground/45`** measures 1.93:1 light
   / 2.16:1 dark — below the 3:1 that SC 1.4.11 asks of an interactive
   control's only glyph. It was 4.74:1 before this commit.

9. **Card location line at `text-muted-foreground/75`** measures 3.28:1
   light / 3.63:1 dark at 11px. Restoring plain `text-muted-foreground`
   gives 5.60:1.

10. **No `prefers-reduced-motion` block anywhere.** The sheet's 2.5rem slide
    fires on every card click; dialog/dropdown/select/tooltip animations,
    skeleton pulses on five routes, and sonner's spinner are all unguarded.

11. **Light ACCEPTED badge 4.13:1 and REJECTED 4.34:1** at 11px normal text
    (needs 4.5:1). *May be resolved by the Atlassian palette — re-measure.*

## Already handled

12. **Offer vs Accepted were indistinguishable** (both green). The Atlassian
    brief already assigns Offer→teal `#164555`/`#9DD9EE` and
    Accepted→green `#164B35`/`#7EE2B8`. Verify after the recolour lands.

---

## Where we stopped — 2026-09-13 evening

Paused mid-workflow at the user's request; resuming tomorrow morning.

**On `main`, all green:**
- `e6f239c` — portaled-sheet drag hijack + dnd-kit hydration mismatch fixed
- `b2c1cbe` — full-width 7-column board + cool-slate palette
- `1167560` — board cards given a drag handle so Enter/Space each mean one thing

**Interrupted:** the Atlassian palette pass. Its *correctness* phase committed
(`e6f239c`); its *palette* phase was stopped before writing anything, so the tree
is clean and nothing is half-applied.

**Next step — apply the real Atlassian Design System palette.** Values were
extracted from `@atlaskit/tokens@16.12.0` (npm) and are recorded below so they do
not need re-deriving:

| role | light | dark |
|---|---|---|
| surface | `#FFFFFF` | `#1F1F21` |
| surface sunken (page) | `#F8F8F8` | `#18191A` |
| surface raised (card) | `#FFFFFF` | `#242528` |
| surface overlay | `#FFFFFF` | `#2B2C2F` |
| text | `#292A2E` | `#CECFD2` |
| text subtle | `#505258` | `#A9ABAF` |
| text subtlest | `#6B6E76` | `#96999E` |
| border (keep the alpha) | `#0B120E24` | `#E3E4F21F` |
| border focused | `#4688EC` | `#8FB8F6` |
| border input | `#8C8F97` | `#7E8188` |
| brand / link | `#1868DB` | `#669DF1` |
| selected bg | `#E9F2FE` | `#1C2B42` |

Stage accents — background / text, Jira's lozenge pattern:

| stage | light | dark |
|---|---|---|
| SAVED (gray) | `#DDDEE1` / `#505258` | `#4B4D51` / `#A9ABAF` |
| APPLIED (blue) | `#CFE1FD` / `#1558BC` | `#123263` / `#8FB8F6` |
| SCREENING (purple) | `#EED7FC` / `#803FA5` | `#48245D` / `#D8A0F7` |
| INTERVIEW (yellow) | `#F5E989` / `#7F5F01` | `#533F04` / `#EED12B` |
| OFFER (teal) | `#C6EDFB` / `#206A83` | `#164555` / `#9DD9EE` |
| ACCEPTED (green) | `#BAF3DB` / `#216E4E` | `#164B35` / `#7EE2B8` |
| REJECTED (red) | `#FFD5D2` / `#AE2E24` | `#5D1F1A` / `#FD9891` |

Offer is teal and Accepted green on purpose — two greens adjacent are
indistinguishable, which a review lens independently confirmed.

Font: **Inter** via `next/font/google`. Atlassian Sans is proprietary.

**Also queued:** a dashboard with real analytics. The original reason it was left
empty ("no data exists yet") expired when Phase 2 shipped — a pipeline funnel,
offer→accept conversion, per-company counts and recent activity are all
computable from existing data today.
