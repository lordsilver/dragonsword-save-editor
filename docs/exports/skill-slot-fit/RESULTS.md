# Skill-slot formula fit (consult, 2026-10-27)

Patch (not applied): skill-slot-formula.patch — applies cleanly to ed39ca8 (`git apply --check`), tsc and Biome clean; the patched gen-icons.mjs reproduces the measured layers (max 1/255).

Mean CIELAB dE over 36 in-game disc crops (6 screenshots; mask = opaque disc minus name plate and badge):
- current editor (ed39ca8): 20.62 (circles 20.09, diamonds 22.00)
- fitted physical model: 6.50
- proposed CSS, emulated offline: 7.41 (circles 6.65, diamonds 9.38)
- proposed CSS, rendered by Windows Chrome: 7.62 (circles 6.86, diamonds 9.59); WebKitGTK MiniBrowser renders the same tiles pixel-identically (dE 0.0 on all fully visible tiles)
- noise floor (same disc, two screenshots): 6.58

Formula (display values, T = MesmerizedUIColor hex): disc; glyph at 1.0x, no filter; circle: lerp(pix, T x shade, cover) with cover = ring13b.a x flare11.a x 0.566 and shade = srgb(min(1, lin(ring13b) x 0.666)), then + T x min(1, srgb(min(1, lin(ring13c) x 1.213)) x ring13c.a x 2.158) (plus-lighter); diamond: + T x min(1, signal.a x 3.6) (plus-lighter). No interior fill.

Scripts: fit.mjs (model + variants), analyse.mjs (diamonds, per-effect colours, sheet), bake.mjs, cssfit.mjs, testpage.mjs (site/ + measure). Logs: fit-run.log, refine.log, diamonds.log, colours.log, emulate.log, cssfit.log.
