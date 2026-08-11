# Task 3 — API integration: live currency conversion

A GBP storefront that shows visitors a converted price in their local currency, with the
GBP price kept underneath.

## How to view it

No build step and no dependencies — open `index.html` in a browser:

```bash
open index.html
```

It works off `file://` (both rate APIs send `Access-Control-Allow-Origin: *`). It does need its
sibling `../ds/` directory, so open it from the repository as it stands rather than copying
`index.html` somewhere on its own. To serve it over HTTP instead:

```bash
python3 -m http.server 8000
```

Worth trying: change the currency in the dropdown, reload to see the choice persist, and
open DevTools → Network to watch the second load make **no** request to the rate API.

## Structure

```
index.html      the storefront markup — prices authored in GBP
currency.css    styles, built on the ds/ tokens
currency.js     detection, fetching, caching, conversion
../ds/          the design system — shared with Task 1
```

`ds/` sits at the repository root because both Task 1 and Task 3 build on it — one copy, so a
token change cannot land in one task and not the other. The token files are copied verbatim from
the design system, so a future re-import overwrites them cleanly. Everything outside `ds/` is
this task's own code.

---

## 3a. The code

**API: [Frankfurter](https://frankfurter.dev)** — `https://api.frankfurter.dev/v1/latest?base=GBP`.
It publishes the European Central Bank's daily reference rates, needs **no API key**, and sends
CORS headers. I picked it for two reasons: the data has a source I can name when a client asks
where the number came from, and a keyless API is the only way to be certain a key never leaks
(see 3b). `open.er-api.com` is configured as a fallback.

The design is progressive enhancement, and that shapes everything else. Prices live in the
markup in GBP and are already correct:

```html
<p class="price" data-price="49.00">
  <span class="price__converted" data-price-converted hidden></span>
  <span class="price__base"><data value="49.00">£49.00</data> GBP</span>
</p>
```

`currency.js` only ever *adds* the converted line above. With JavaScript off, the API down, or
the cache cold, the page is a normal GBP shop rather than a broken one — there is no state in
which a price is empty, wrong, or `NaN`.

The flow on load:

1. Pick a currency — a saved preference wins; otherwise the region subtag from
   `navigator.language` (via `Intl.Locale`, which parses `zh-Hans-CN` correctly where splitting
   on `-` does not) through a region→currency map; otherwise GBP.
2. Paint from the `localStorage` cache immediately, then revalidate behind it if it is stale.
3. Populate the selector from the rate table, so we only ever offer a currency we can quote.
4. Format with `Intl.NumberFormat` — it already knows JPY has no minor unit and where each
   symbol goes.

Providers sit behind a two-property adapter (`url`, `parse`) that normalises both vendors to the
same `{ date, rates }` shape, so reordering or adding one touches nothing else.

## 3b. Failure, caching, and the exposed API key

**Failure.** No error dialogs, no spinners, no broken prices. Because GBP is already in the HTML,
every failure mode degrades to "this is a GBP shop" — which is true, and is what the customer is
charged anyway. Concretely:

- Each request gets a 5s `AbortController` timeout, so a hanging vendor cannot hold the page.
- A `200` with a malformed body is treated as a failure, not as a licence to render `£NaN`:
  the rate table is validated (right shape, target present, every value finite and positive)
  before anything reaches the DOM.
- If Frankfurter fails, `open.er-api.com` is tried before giving up. This is not theoretical —
  in my sandboxed test browser Frankfurter timed out and the fallback carried the page.
- If both fail, a stale cache is still used, however old, and labelled *"rates from 11 Aug 2026"*
  rather than *"updated"*, so an old figure can never pass itself off as a live one.
- `localStorage` access is guarded throughout; Safari in private mode throws on write, and that
  must not take the prices down with it.

**What the user sees when the call fails.** If they had explicitly chosen a currency, the polite
live region reads *"Live rates unavailable — showing prices in GBP."* and the selector resets to
GBP so the control and the prices agree. If we had only *guessed* their currency from locale,
they see nothing at all — GBP prices, no message. They never knew a conversion was on offer, and
inventing an error for them would be noise.

**Caching.** `localStorage`, 12-hour TTL, stale-while-revalidate. The ECB publishes once a day on
weekdays, so polling harder than that buys precision that does not exist — at most one request per
visitor per 12 hours, and usually zero. One request returns the whole rate table for GBP, so
changing the dropdown is a pure re-render with no network call and therefore nothing that can fail
mid-interaction. Painting from cache first means the converted price is there on first paint: no
spinner, no layout shift, no flash of GBP. The cache key is versioned (`refuells.rates.v1.GBP`) so
a future shape change invalidates old entries instead of crashing on them.

At real traffic this moves behind a CDN edge cache (`s-maxage`) in front of a proxy — one upstream
call an hour for the whole site instead of one per visitor.

**The exposed API key.** Handled by not having one. The most reliable way to avoid leaking a key
is not to ship one, which is a large part of why I chose Frankfurter over the keyed services.

If a keyed provider were required, the key would not go in JavaScript, in the HTML, or in a query
string. Anything the browser can send, a visitor can read off the Network tab and spend your quota
with — and rate-limit or bill you for. It belongs in a server-side proxy (a Cloudflare Worker, a
WordPress REST route, a Shopify app backend) holding the key in an environment variable, with CORS
locked to your own origin, a cache in front of it, and rate limiting. The browser calls your
origin; only your origin ever calls the vendor. A key that has been committed to a repository is
burned — it needs rotating, not deleting from the next commit.

## 3c. Where this would live in a real Shopify build

It would not live in theme JavaScript, and mostly it would not be written at all. Shopify Markets
with Shopify Payments does multi-currency natively: the platform holds the rates and the per-market
rounding rules, Liquid renders `{{ product.price | money }}` server-side, and the currency picker
is the theme's built-in `{% form 'localization' %}` (Dawn ships one). Presentation lives in the
theme; rates live in the platform.

The reason this matters is not tidiness. Doing conversion in theme JS means the page says €57 and
the checkout charges £49, because the checkout is Shopify's and it has never heard of your script.
That gap costs you the sale at the last step, generates support tickets, and is a price-transparency
problem you do not want to defend. Server-rendered prices also avoid the flash of GBP and the layout
shift that any client-side swap introduces.

If a genuinely custom rate source were contractually required — negotiated rates rather than market
ones — it would go in a Shopify app backend behind an App Proxy, or a server route in a
Hydrogen/Oxygen build: server-side, cached, key-safe, and written into the cart so that what is
displayed and what is charged are the same number.

---

## Assumptions

- Prices are stored and charged in GBP; conversion is display-only. The disclaimer on the page
  says so, because showing a converted price without saying that is a mis-sale waiting to happen.
- Locale is treated as a hint, not a fact — it is a language preference, not a location. That is
  why the selector is always visible and a saved choice always wins over detection. I deliberately
  avoided IP geolocation: it adds a second network dependency, a second failure mode, and personal
  data to justify handling, for an outcome the visitor can correct in one click.
- The region→currency map covers the currencies Frankfurter quotes rather than all ~180. Anything
  unmapped falls back to GBP, which is always a safe answer.
- No rounding rules applied beyond `Intl` defaults. Charm pricing (€56.99 rather than €57.33) is a
  commercial decision, not a developer one.

## What I would do differently with more time

- Put an edge-cached proxy in front of the API, so the site makes one upstream call an hour rather
  than one per visitor per 12 hours, and geolocate from the CDN's country header
  (`CF-IPCountry` / `Cloudfront-Viewer-Country`) instead of inferring from locale.
- Unit-test the parse and validate layer against recorded vendor payloads, including the malformed
  ones — that is where this class of bug actually lives.
- Agree per-currency rounding with the client and apply it consistently.

## Verified

Checked in-browser rather than assumed:

| Case | Result |
| --- | --- |
| Happy path | ZAR shown above `£49.00 GBP`, rate and date in the status line |
| Second load | Zero requests to the rate API — served from cache |
| Currency switch | Prices update, zero network requests, choice persists across reloads |
| Primary provider down | Frankfurter timed out; `open.er-api.com` carried it |
| Both providers down | GBP only, selector reset to GBP, no `NaN`, no uncaught errors |
| Mobile (375px) | Grid stacks 4 → 2 → 1, control wraps, nothing clipped |
