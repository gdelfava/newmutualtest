How to view it — open index.html works directly off file://, with a python3 -m http.server alternative. Includes a short list of what's worth trying (the toggle, keyboard focus, narrowing the window).

Assumptions — the seven that shaped the build: static output with no build step (empty target directory, no stack to match), the Google Fonts CDN as the one deliberate divergence from the source, fidelity over interpretation, only Button and Badge ported from the bundle's fifteen components, CTAs with no destinations because the design specifies none, dark-only because the palette file says so explicitly, and prices/copy treated as content rather than verified commercial truth. The rounding quirk gets its own subsection so it reads as a decision rather than an oversight.

With more time — self-hosting the font, fallbacks for color-mix() and text-wrap after a real cross-browser pass, an actual screen-reader run (I verified through the accessibility tree, which isn't the same thing), unit tests on the three pure pricing functions, persisting the billing choice so a shared annual link stays annual, and scoping decisions if this gets integrated into a larger site.

One note on honesty in that last section: I listed the screen-reader gap explicitly because it's the difference between what I could verify in a headless browser and what actually matters to a user.
