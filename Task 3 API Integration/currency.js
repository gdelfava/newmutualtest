/* Refuells — live currency conversion for a GBP storefront.

   Progressive enhancement, deliberately. Prices are authored in the markup in
   the base currency and are already correct; this script only ever ADDS a
   converted line above them. If the API is down, the cache is cold, or JS never
   runs, the page is a normal GBP shop rather than a broken one.

   Config is read off the <main> element:
     data-base-currency   the currency prices are stored and charged in
     data-rate-ttl-hours  how long a cached rate table stays fresh

   Rates: Frankfurter (ECB reference rates, no API key), falling back to
   open.er-api.com. Neither needs a key — see README §3b. */
(() => {
  "use strict";

  const root = document.querySelector("[data-base-currency]");
  if (!root) return;

  const select = root.querySelector("[data-currency-select]");
  const status = root.querySelector("[data-rate-status]");
  const priceEls = root.querySelectorAll("[data-price]");
  if (!select || !status || !priceEls.length) return;

  const BASE = root.dataset.baseCurrency || "GBP";

  /* ECB publishes once a day on weekdays, so a 12h default is generous and
     still never more than a day behind. Polling harder buys nothing. */
  const ttlHours = Number(root.dataset.rateTtlHours);
  const TTL_MS = (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 12) * 3600000;

  const TIMEOUT_MS = 5000;
  const CACHE_KEY = "refuells.rates.v1." + BASE;
  const PREF_KEY = "refuells.currency.v1";

  const LOCALE = navigator.language || "en-GB";

  /* Providers are tried in order. Each `parse` normalises the vendor's response
     to the same { date, rates } shape, so adding or reordering a provider never
     touches anything below. */
  const PROVIDERS = [
    {
      name: "Frankfurter",
      url: base => "https://api.frankfurter.dev/v1/latest?base=" + base,
      parse: json => ({ date: json.date, rates: json.rates })
    },
    {
      name: "open.er-api.com",
      url: base => "https://open.er-api.com/v6/latest/" + base,
      parse: json => ({ date: isoDay(json.time_last_update_unix), rates: json.rates })
    }
  ];

  /* Region → currency. Scope is exactly the set Frankfurter quotes: detecting a
     currency we cannot convert would only produce a fallback a moment later. */
  const EUROZONE = ["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE",
                    "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"];

  const CURRENCY_BY_REGION = {
    GB: "GBP", US: "USD", ZA: "ZAR", AU: "AUD", NZ: "NZD", CA: "CAD", CH: "CHF",
    CN: "CNY", CZ: "CZK", DK: "DKK", HK: "HKD", HU: "HUF", ID: "IDR", IL: "ILS",
    IN: "INR", IS: "ISK", JP: "JPY", KR: "KRW", MX: "MXN", MY: "MYR", NO: "NOK",
    PH: "PHP", PL: "PLN", RO: "RON", SE: "SEK", SG: "SGD", TH: "THB", TR: "TRY",
    BR: "BRL"
  };
  EUROZONE.forEach(region => { CURRENCY_BY_REGION[region] = "EUR"; });

  /* ---- State ---------------------------------------------------------- */

  let table = null;      /* { date, rates, fetchedAt } — null until we hold one */
  let live = false;      /* was this table fetched during this page load?       */
  let currency = BASE;   /* the currency the visitor has asked for              */
  let chosen = false;    /* did they ask for it explicitly, or did we guess?    */

  /* ---- Formatting ------------------------------------------------------ */

  /* Intl already knows JPY has no minor unit and where every symbol goes.
     Hand-rolling a symbol table is how you end up shipping "R 1,234.00 ZAR". */
  function money(amount, code) {
    try {
      return new Intl.NumberFormat(LOCALE, { style: "currency", currency: code }).format(amount);
    } catch (error) {
      return code + " " + amount.toFixed(2);
    }
  }

  const rateText = rate =>
    new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 4 }).format(rate);

  const currencyName = (() => {
    let names = null;
    try { names = new Intl.DisplayNames([LOCALE], { type: "currency" }); } catch (error) { /* older browser */ }
    return code => {
      try { return (names && names.of(code)) || code; } catch (error) { return code; }
    };
  })();

  function isoDay(unixSeconds) {
    const date = new Date(Number(unixSeconds) * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  function dayText(iso) {
    const date = new Date(iso + "T00:00:00Z");
    if (Number.isNaN(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat(LOCALE, {
        day: "numeric", month: "short", year: "numeric", timeZone: "UTC"
      }).format(date);
    } catch (error) {
      return iso;
    }
  }

  /* ---- Fetching -------------------------------------------------------- */

  /* A 200 with a malformed body is a failure, not a licence to render "£NaN". */
  function isUsable(rates) {
    if (!rates || typeof rates !== "object" || Array.isArray(rates)) return false;
    const values = Object.values(rates);
    return values.length > 0 && values.every(v => typeof v === "number" && Number.isFinite(v) && v > 0);
  }

  async function fetchFrom(provider) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(provider.url(BASE), { signal: controller.signal });
      if (!response.ok) throw new Error(provider.name + " returned HTTP " + response.status);

      const parsed = provider.parse(await response.json());
      if (!isUsable(parsed.rates)) throw new Error(provider.name + " returned an unusable rate table");

      return { date: parsed.date || null, rates: parsed.rates, fetchedAt: Date.now() };
    } finally {
      clearTimeout(timer);
    }
  }

  /* Returns null when every provider fails — the caller falls back to whatever
     cache it holds, so a total outage is a quiet degradation, not an exception. */
  async function fetchRates() {
    for (const provider of PROVIDERS) {
      try {
        return await fetchFrom(provider);
      } catch (error) {
        console.warn("[currency] " + (error.name === "AbortError"
          ? provider.name + " timed out after " + TIMEOUT_MS + "ms"
          : error.message));
      }
    }
    return null;
  }

  /* ---- Storage --------------------------------------------------------- */
  /* Every access is guarded: Safari in private mode throws on write, and a
     storage failure must never take the prices down with it. */

  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (!cached || !isUsable(cached.rates) || !Number.isFinite(cached.fetchedAt)) return null;
      return cached;
    } catch (error) {
      return null;
    }
  }

  function writeCache(value) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch (error) { /* quota or private mode */ }
  }

  function readPref() {
    try {
      const saved = localStorage.getItem(PREF_KEY);
      return /^[A-Z]{3}$/.test(saved) ? saved : null;
    } catch (error) {
      return null;
    }
  }

  function writePref(code) {
    try { localStorage.setItem(PREF_KEY, code); } catch (error) { /* nothing to do */ }
  }

  /* ---- Detection ------------------------------------------------------- */

  /* Intl.Locale parses the tag properly — "zh-Hans-CN" has its region in the
     third position, which splitting on "-" gets wrong. */
  function localeRegion() {
    const tag = navigator.language;
    if (!tag) return null;
    try {
      return new Intl.Locale(tag).region || null;
    } catch (error) {
      const parts = tag.split("-");
      return parts.length > 1 ? parts[1].toUpperCase() : null;
    }
  }

  /* A saved preference always wins: the visitor told us, we don't re-guess.
     Locale is a language preference rather than a location, so it is a hint —
     hence the always-visible selector. Anything unmapped stays on the base. */
  function detect() {
    const saved = readPref();
    if (saved) return { code: saved, chosen: true };

    const region = localeRegion();
    return { code: (region && CURRENCY_BY_REGION[region]) || BASE, chosen: false };
  }

  /* ---- Rendering ------------------------------------------------------- */

  /* The currency actually displayed: the requested one when we hold a usable
     rate for it, otherwise the base. Keeps the selector and the prices honest
     about each other — we never label GBP numbers as rand. */
  function effective() {
    if (currency === BASE) return BASE;
    return table && table.rates[currency] > 0 ? currency : BASE;
  }

  function statusText() {
    const code = effective();

    if (code === BASE) {
      /* Only say something went wrong to someone who asked for a conversion.
         A UK visitor seeing GBP has not experienced a failure. */
      return currency !== BASE && chosen
        ? "Live rates unavailable — showing prices in " + BASE + "."
        : "Prices shown in " + BASE + ".";
    }

    const line = "1 " + BASE + " = " + rateText(table.rates[code]) + " " + code;
    const when = table.date && dayText(table.date);
    if (!when) return line + ".";

    /* "rates from" rather than "updated" when they came off the cache, so a
       stale figure can never pass itself off as a live one. */
    return line + (live ? " · updated " + when : " · rates from " + when);
  }

  function render() {
    const code = effective();
    const rate = code === BASE ? null : table.rates[code];

    priceEls.forEach(el => {
      const converted = el.querySelector("[data-price-converted]");
      const amount = Number(el.dataset.price);

      if (!rate || !Number.isFinite(amount)) {
        converted.hidden = true;
        el.classList.remove("price--converted");
        return;
      }

      converted.textContent = money(amount * rate, code);
      converted.hidden = false;
      el.classList.add("price--converted");
    });

    status.textContent = statusText();
  }

  /* Options come from the rate table, so we only ever offer a currency we can
     actually quote. The base is pinned first; the rest sort by display name. */
  function populateSelect() {
    const codes = table
      ? Object.keys(table.rates)
          .filter(code => code !== BASE)
          .sort((a, b) => currencyName(a).localeCompare(currencyName(b), LOCALE))
      : [];

    select.replaceChildren(...[BASE, ...codes].map(code => {
      const option = document.createElement("option");
      const name = currencyName(code);
      option.value = code;
      /* Intl has no name for a few minor codes and hands the code back — show
         it once rather than as "CLF — CLF". */
      option.textContent = name === code ? code : code + " — " + name;
      return option;
    }));

    select.value = effective();
  }

  /* ---- Wiring ---------------------------------------------------------- */

  /* One fetch returns every rate for the base, so switching currency is pure
     re-render: no network, no spinner, no chance of failing mid-interaction. */
  select.addEventListener("change", () => {
    currency = select.value;
    chosen = true;
    writePref(currency);
    render();
  });

  async function refresh() {
    const fresh = await fetchRates();

    /* Total failure: keep the cache we already have, however old. Something
       slightly stale beats falling back to nothing. */
    if (!fresh) {
      render();
      return;
    }

    table = fresh;
    live = true;
    writeCache(fresh);
    populateSelect();
    render();
  }

  function init() {
    const detected = detect();
    currency = detected.code;
    chosen = detected.chosen;

    /* Paint from cache first, revalidate behind it. The converted price is
       there on first paint — no spinner, no layout shift, no flash of GBP. */
    table = readCache();
    populateSelect();
    render();

    if (table && Date.now() - table.fetchedAt < TTL_MS) return;

    refresh();
  }

  init();
})();
