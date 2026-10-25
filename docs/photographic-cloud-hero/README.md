# Photographic Cloud Window

The landing hero now uses the exact cloud photograph selected by the owner:
[“Nimbus clouds and blue calm sky”](https://unsplash.com/photos/nimbus-clouds-and-blue-calm-sky-9BJRGlqoIUk)
by [Pero Kalimero](https://unsplash.com/@pericakalimerica) on Unsplash.
[Unsplash License](https://unsplash.com/license).

The source is 3504 × 2336. The checked-in WebP is 2400 × 1600, 93,676 bytes,
encoded at quality 85 with metadata removed. Next Image supplies responsive,
locally served variants, a blur placeholder and hero preload. No external image
host is needed at runtime. A visible photographer/source credit is included.

Unsplash remained unreachable through the execution environment's proxy, even
after network permission was granted. The source JPEG was obtained from this
[public mirror](https://github.com/prandell/Inhalert/blob/c4a3c268ac939249b48505577c69e766ef81e4d3/public/img/pero-kalimero-9BJRGlqoIUk-unsplash.jpg),
whose filename identifies the same photographer and Unsplash photo ID. Its
resolution and image were visually matched against the owner's supplied image.
The source/standard license links above are retained for review; no claim is made
that the current live Unsplash page was fetched successfully.

The photograph replaces procedurally generated clouds. `CloudPhotoMotion` samples
that same photo through a small WebGL shader. Mouse movement paints directional
strokes into a low-resolution displacement field, pulling nearby photo detail
along the pointer's path. The deformation stays where it was made and decays
smoothly back to the original photo, even while the cursor remains still. There
is no radial zoom/lens or ambient drift. A height-based foreground mask still
lets the cloud bank move faster than the distant sky during scroll. It approximates depth from
a single photo, rather than reconstructing a 3D scene. The frame, text, controls
and credit remain stationary relative to the page.

Scroll targets ease into position, while drag/hover smears relax exponentially
and snap to an exact neutral state once imperceptible. Displacement is bounded
for quick sweeps and narrow screens. Coarse/touch input does not paint strokes.
Rendering pauses offscreen, in hidden tabs, and when everything has settled;
scroll or pointer activity wakes it again. Drawing
resolution is capped at 1.8 million pixels / DPR 1.5. GPU resources, observers and
listeners are released on teardown or a reduced-motion preference change. The
server-rendered Next Image remains underneath: unavailable/failed/lost WebGL uses
ordinary CSS photo parallax, and reduced motion keeps a completely static photo.
The image is decorative and no remote texture is loaded.

Validation: production build and all 100 unit tests pass. [Browser checks](browser-checks.jsonl)
exercise actual WebGL, disabled WebGL and reduced motion on desktop and touch
phone viewports, including directional displacement uploads, no deformation
from a stationary pointer, decay after movement/exit, exact before/after photo
pixel equality, idle pause, scroll uniforms, stable copy, no horizontal
overflow/page errors, offscreen pause/re-entry, live reduced-motion toggles and
context-loss fallback. Unit checks cover direction, localized influence, full
neutral reset and bounded rapid strokes at different aspect ratios. Desktop uses light mode and phone uses dark mode.

Run the browser checks against a running production build:

```sh
PREFLIGHT_REVIEW_URL=http://localhost:3066 node tests/cloud-photo-motion.browser.cjs
```

The initial static-photo review additionally covered 1440, 768 and 390 px widths
in both themes with zero Axe WCAG A/AA violations. Image backgrounds need visual
contrast review in addition to automated checks; desktop and phone captures were
reviewed after adding motion.

[Desktop preview](desktop.png) · [Mobile preview](mobile.png)
