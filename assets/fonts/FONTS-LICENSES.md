# Bundled font licenses

All fonts bundled here are open-licensed upstream originals — NOT the proprietary
"Foundry distribution assets" (Signika-via-Foundry-package / Font Awesome Pro).

| Family | Files | License | Source |
| --- | --- | --- | --- |
| Spectral | `spectral-latin-*-normal.woff2` | SIL Open Font License 1.1 | Google Fonts / Fontsource |
| JetBrains Mono | `jetbrains-mono-latin-*-normal.woff2` | SIL Open Font License 1.1 | Google Fonts / Fontsource |
| Signika | `signika-latin-*-normal.woff2` | SIL Open Font License 1.1 | Google Fonts / Fontsource |
| Font Awesome 6 Free | `fontawesome/webfonts/fa-*.woff2` | SIL OFL 1.1 (fonts); CC BY 4.0 (icons); MIT (code) | Font Awesome Free 6.7.2 |

Signika, Spectral, and JetBrains Mono self-host the fabricate/View Lab type, and the Font Awesome Free bundle backs the View Lab's icon glyphs so a missing icon renders a real glyph rather than tofu (see `tests/view-lab/`).
The player-facing Fabricate module does not ship these at runtime — Signika and Font Awesome come from Foundry core in-app; the Signika + FA bundle exists only for the deterministic, Foundry-free View Lab render.
