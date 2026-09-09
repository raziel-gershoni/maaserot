# Maaserot design system

The contract every screen builds against. Tokens live in `src/app/globals.css`,
primitives in `src/components/ui/`.

## The one rule about colour

**Use the semantic layer. Never write a `dark:` variant.**

Semantic utilities inline a `var()` that `@media (prefers-color-scheme: dark)`
redefines, so one class is correct in both themes. Adding `dark:` on top of a
semantic utility is always a bug.

| Utility | Use for |
|---|---|
| `bg-canvas` | the page ground |
| `bg-surface` | cards, panels, modals, sticky bars |
| `bg-surface-sunken` | inset rows, tracks, hover on ghost controls |
| `border-line` / `border-line-strong` | hairlines / input + secondary-button borders |
| `text-ink` | primary text |
| `text-ink-muted` | secondary text, descriptions |
| `text-ink-faint` | meta, eyebrows, placeholders |
| `bg-brand` `text-brand-ink` `bg-brand-hover` | primary actions |
| `bg-brand-soft` `text-brand-soft-ink` `border-brand-line` | brand tints |
| `bg-accent` `text-accent-ink` `bg-accent-soft` `text-accent-soft-ink` | group / partnership |
| `text-positive` `bg-positive-soft` `text-positive-soft-ink` | paid, success |
| `text-caution` `bg-caution-soft` `text-caution-soft-ink` | unpaid, warnings |
| `text-critical` `bg-critical-soft` `text-critical-soft-ink` | errors, destructive |

Raw ramps (`clay` `plum` `sand` `sage` `amber` `rust`, 50–900) exist for genuine
one-offs. If you reach for one, ask first whether a semantic token means it.

**Never use** `gray-*` `blue-*` `indigo-*` `purple-*` `green-*` `red-*`
`yellow-*` `bg-white` `bg-black` (except `bg-black/50` for a scrim),
`text-foreground`, `bg-background`. `tailwind.config.ts` is deleted — those
palettes are stock Tailwind and clash with the brand.

## Radius ladder

`rounded-control` (10px) buttons, inputs · `rounded-row` (12px) rows, alerts,
inset panels · `rounded-card` (16px) cards · `rounded-panel` (20px) modals ·
`rounded-full` pills, avatars, tracks.

Never nest a larger radius inside a smaller one.

## Elevation

`shadow-card` on cards (paired with `border-line`), `shadow-raised` for
genuinely floating things, `shadow-overlay` for modals only. A card gets a
border **or** a heavy shadow, not both.

## Type

- `font-display` (Rubik) — headings and money. Applied automatically to
  `h1`–`h4` and by `<Money>`.
- `font-sans` (Assistant) — everything else. The default.
- `text-eyebrow` — 11px, tracked, semibold. Section labels, stat labels.
- `text-figure-sm` / `text-figure` / `text-figure-lg` — money only.
- `tabular` — any column of numbers. `<Money>` applies it already.

Hierarchy comes from size and colour, not from `font-bold` on everything.

## RTL — non-negotiable

Hebrew is the default locale. **Only logical properties.**

| Never | Always |
|---|---|
| `ml-` `mr-` | `ms-` `me-` |
| `pl-` `pr-` | `ps-` `pe-` |
| `left-` `right-` | `start-` `end-` |
| `text-left` `text-right` | `text-start` `text-end` |
| `rounded-l-` `rounded-r-` | `rounded-s-` `rounded-e-` |
| `border-l` `border-r` | `border-s` `border-e` |

- Directional icons (chevrons, arrows, send) need `rtl:rotate-180`.
- Never concatenate a glyph onto a translated string (`'✓ ' + t('paid')`) — the
  bidi algorithm places it, not you. Use `<Badge icon={…}>`.
- Latin text inside Hebrew (emails, names) must be isolated: `bidi-isolate`.
- Money always goes through `<Money>` — never
  `` `₪${(agorot/100).toFixed(2)}` ``, which the old income and charities pages
  each reinvented.
- `flex` rows containing a translated label plus a button need `flex-wrap`.
  Hebrew strings run long and there is no ellipsis budget.

## Primitives

```tsx
import {
  Alert, Badge, Button, buttonStyles, Card, CardHeader, SectionRule,
  Dialog, EmptyState, Field, SelectField, Figure, Money, PageHeader,
  ReckoningBar, Skeleton, SkeletonRows, Spinner,
} from '@/components/ui';
```

- `<Button variant size fullWidth icon pending pendingLabel startSlot>` —
  variants `primary` `secondary` `accent` `ghost` `danger` `dangerSolid`;
  sizes `sm` (36) `md` (44) `lg` (52). For a `<Link>` styled as a button use
  `className={buttonStyles({ variant, size, fullWidth })}`.
  `danger` is an outline — reserve `dangerSolid` for the confirm inside a
  dialog.
- `<Card as padded>` — the only card recipe.
- `<SectionRule>label</SectionRule>` — the ledger rule. Use it to open every
  subsection inside a card.
- `<CardHeader title description action />`, `<PageHeader title description action />`.
- `<Field label hint error affix />` — wires `htmlFor`, `aria-describedby`,
  `aria-invalid`. Units go in `affix`, never in the label string.
- `<Alert tone="info|success|warning|error" title action>`.
- `<Badge tone icon>` — status pills.
- `<Money agorot locale size tone />`, `<Figure label agorot … />`.
- `<Dialog open onClose title description footer size closeLabel>` — portal,
  focus trap, Esc, scroll lock, `bg-black/50`. Replaces every hand-rolled
  overlay.
- `<EmptyState icon title description action />` — an empty screen invites an
  action. A failed fetch is `<Alert tone="error">`, not an empty state.
- `<Skeleton>` / `<SkeletonRows rows>` — show these while loading. Never flash
  an empty state before data resolves.
- `<ReckoningBar totalMaaser fixedCharities paid locale labels />` — the
  signature. Dashboard only.

## Interaction floor

Every screen ships with: visible `focus-visible` rings (inherited — don't
remove them), ≥44px touch targets for primary actions, a loading state, an
empty state, and an error state. Errors say what happened and what to do; they
do not apologise.

## Copy

Sentence case. Active voice. An action keeps its name through the whole flow —
the button that says "Pay" produces a toast that says "Paid". Label what the
person controls, not how the system stores it.
