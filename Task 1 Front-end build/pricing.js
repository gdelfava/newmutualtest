/* Refuells — Pricing section behaviour.
   Ported from the DCLogic class in Pricing Section.dc.html. The two component
   props are read off the section element:
     data-default-billing  "Monthly" | "Annual"
     data-annual-discount  percent off when billed annually (5–50) */
(() => {
  "use strict";

  const root = document.getElementById("pricing");
  if (!root) return;

  /* Monthly list price per tier, in rand: Solo, Driver Plus, Fleet. */
  const BASE = [49, 99, 249];

  const parsed = Number(root.dataset.annualDiscount);
  const discount = Number.isFinite(parsed) ? parsed : 20;

  let annual = root.dataset.defaultBilling === "Annual";

  const pills = root.querySelectorAll("[data-billing]");
  const priceEls = root.querySelectorAll("[data-price]");
  const billedEls = root.querySelectorAll("[data-billed]");
  const perLabels = root.querySelectorAll("[data-per-label]");
  const savingsNote = root.querySelector("[data-savings-note]");
  const liveNote = root.querySelector("[data-live-note]");

  /* Rounds, then groups thousands with a space: 2390 -> "2 390".
     Note the rounding happens before grouping and before the yearly
     multiplication below, exactly as in the source. */
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  const priceOf = i => (annual ? BASE[i] * (1 - discount / 100) : BASE[i]);

  const billedFor = i =>
    annual ? "R " + fmt(priceOf(i) * 12) + " billed yearly" : "billed monthly";

  function render() {
    pills.forEach(pill => {
      const isActive = (pill.dataset.billing === "annual") === annual;
      pill.setAttribute("aria-pressed", String(isActive));
    });

    priceEls.forEach(el => {
      el.textContent = fmt(priceOf(Number(el.dataset.price)));
    });

    billedEls.forEach(el => {
      el.textContent = billedFor(Number(el.dataset.billed));
    });

    perLabels.forEach(el => {
      el.textContent = "per month";
    });

    savingsNote.textContent = annual
      ? "You save " + discount + "%"
      : "Save " + discount + "% on annual";

    liveNote.textContent = annual
      ? "Annual plans are billed once, " + discount + "% below the monthly rate. Prices include VAT."
      : "Switch to annual to pay " + discount + "% less per month. Prices include VAT.";
  }

  root.querySelector(".billing__switch").addEventListener("click", event => {
    const pill = event.target.closest("[data-billing]");
    if (!pill) return;

    const next = pill.dataset.billing === "annual";
    if (next === annual) return;

    annual = next;
    render();
  });

  render();
})();
