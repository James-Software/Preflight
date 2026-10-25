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

The photograph replaces the mounted procedural WebGL hero. The nearly full-width
rounded rectangle remains fixed in shape. Copy uses dark navy over the bright
sky/clouds in both themes. A slow CSS transform adds slight drift inside the
clipped window; reduced-motion preferences disable it. The image is decorative
and the credit stays below the CTA stack at mobile sizes.

Validation: production build and all 97 unit tests pass. [Browser checks](browser-checks.jsonl)
cover 1440, 768 and 390 px widths in light/dark themes: loaded image, no hero WebGL,
no horizontal overflow or page errors, reduced-motion behavior, visible credit
below controls, and zero Axe WCAG A/AA violations in the hero. Image backgrounds
need visual contrast review in addition to automated checks; desktop and phone
captures were reviewed.

[Desktop preview](desktop.png) · [Mobile preview](mobile.png)
