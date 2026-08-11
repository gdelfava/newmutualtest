# Refuells — Pricing Section

A static implementation of the `Pricing Section.dc.html` design from the
[Refuells Design System](https://claude.ai/design/p/61a1b1e0-f764-45e3-b71f-8327aeb8f9a1)
Claude Design project. No build step — open `index.html` in a browser.

## Structure

```
index.html        the section markup
pricing.css       the section's styles
pricing.js        the monthly/annual billing toggle
../ds/            the design system — shared with Task 3
  styles.css      design-system entry point (@import manifest)
  components.css  Button + Badge, ported from the DS bundle
  tokens/         colors, fonts, icons, typography, spacing, radius
```

`ds/` sits at the repository root because both Task 1 and Task 3 build on it —
one copy, so a token change cannot land in one task and not the other. It is
design-system territory: the token files are copied verbatim from the source
project, so a future re-import overwrites them cleanly. Everything outside
`ds/` is this section's own code.

Because of that the page needs its sibling directory present. Open it from the
repository as it stands, not by copying `index.html` somewhere on its own.

## Configuration

The two props from the original design are attributes on the section element in
`index.html`:

```html
<section id="pricing" data-default-billing="Monthly" data-annual-discount="20">
```

| Attribute | Values | Effect |
| --- | --- | --- |
| `data-default-billing` | `Monthly` \| `Annual` | Which pill is selected on load |
| `data-annual-discount` | `5`–`50` | Percent off the monthly rate when billed annually |

Base monthly prices live in `BASE` at the top of `pricing.js` — `[49, 99, 249]`
for Solo, Driver Plus and Fleet.

## Notes on fidelity

- Prices round before the yearly total is computed, so Solo at 20% annual shows
  `R 39` per month but `R 470` billed yearly (39.2 × 12). This matches the
  source and is intentional — don't "reconcile" it without a design decision.
- The font loads from the Google Fonts CDN. To go offline, drop
  `AnekLatin-VariableFont.ttf` into `assets/fonts/` and follow the commented
  block in `ds/tokens/fonts.css`.
- The pill toggle is styled off `aria-pressed`, so the visual and announced
  states cannot drift apart.

  Attribution: Claude Code and Claude Design
