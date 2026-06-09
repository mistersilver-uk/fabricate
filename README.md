![](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2Fmistersilver-uk%2Ffabricate%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
<!--- Downloads @ Latest Badge -->
![Latest Release Download Count](https://img.shields.io/github/downloads/mistersilver-uk/fabricate/latest/total?sort=semver&style=for-the-badge)
![Total Release Download Count](https://img.shields.io/github/downloads/mistersilver-uk/fabricate/total?label=total%20downloads&style=for-the-badge)
<!--- Social badges -->
[![Support me on Patreon](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Fshieldsio-patreon.vercel.app%2Fapi%3Fusername%3Dmisterpotts%26type%3Dpatrons&style=for-the-badge)](https://patreon.com/mistersilver)
[![Discord](https://dcbadge.limes.pink/api/server/APHyMzhPTk)](https://discord.gg/APHyMzhPTk)

<!--- Forge Bazaar Install % Badge -->
<!--- replace <your-module-name> with the `name` in your manifest -->
<!--- ![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Ffabricate&colorB=4aa94a) -->

![](/assets/img/fabricate-repo-preview.png)

# Fabricate - Universal Crafting System

A system-agnostic, flexible crafting and gathering module for Foundry Virtual Tabletop that supports any tabletop RPG system and any crafting system you can imagine.

## Features

- **Crafting Systems** — Define independent crafting systems, each with their own managed items, essences, and feature toggles.
- **Recipes** — Simple or multi-step recipes with ingredient sets, catalysts, and result groups.
- **Resolution Modes** — Simple, mapped, tiered, and progressive crafting modes.
- **Visibility and Knowledge** — Control which recipes players can see via player lists or knowledge-based discovery.
- **Essences** — Infuse items with abstract essences for flexible ingredient matching.
- **Tools** — Tools and workstations with optional usage tracking and breakage mechanics.
- **Active Effect Transfer** — Transfer effects from ingredients to crafted items.
- **Macro Integration** — Hook into success and failure outcomes with custom macros.
- **Time and Currency Requirements** — Optional time or currency costs per crafting system.
- **Salvage** — Break down managed items into components.
- **Gathering** — Explore environments, attempt gathering tasks, avoid or encounter hazards and harvest resources.

## Installation

### Official Module List

Fabricate isn't on the official module list yet, but when it is, you only need to follow the steps below to install it:

1. In Foundry VTT, go to **Add-on Modules**
2. Click **Install Module**
3. Search for "Fabricate" or paste the manifest URL
4. Click **Install**
5. Enable the module in your world

## Quick Start

See [quickstart](https://mistersilver-uk.github.io/fabricate/quickstart.html) for a step-by-step guide.

## Documentation

Check out the full [docs site](https://mistersilver-uk.github.io/fabricate/).

## Development

```bash
npm install
npm test         # Run test suite
npm run build    # Vite build to /dist
```

Canonical specifications live under `openspec/specs/`. Non-trivial implementation work should be planned under `openspec/changes/<change>/`.

### Live Foundry Smoke Test

Fabricate includes a full and lightweight end-to-end smoke harness against a real Foundry instance.

```bash
# 1) Install browser binary once
npm run test:foundry:install

# 2) Export Foundry credentials in your shell (do not commit credentials)
export FOUNDRY_USERNAME='your-foundry-account'
export FOUNDRY_PASSWORD='your-foundry-password'
# Optional: select a specific purchased license key
# export FOUNDRY_LICENSE_KEY='1'

# 3) Run end-to-end flow (up -> smoke run -> down)
npm run test:foundry
```

Available commands:

```bash
npm run test:foundry:up
npm run test:foundry:run
npm run test:foundry:down
```

`test:foundry:run` writes feedback artifacts to `test-results/`:

- `summary.json` (machine-readable pass/fail + error details)
- `console.log` (captured browser console + page errors)
- `screenshot-*.png` (key checkpoints and failure capture)

Notes:

- The smoke test handles first-run `/license` in-browser by checking "I agree" and clicking `AGREE`.
- In GitHub Actions ephemeral runners, store `FOUNDRY_USERNAME` and `FOUNDRY_PASSWORD` as repository secrets.
- If your Foundry setup requires different Docker env vars or image settings, update `docker-compose.foundry.yml`.

See [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [openspec/README.md](openspec/README.md) for contributor and agent workflow guidance.

## Support

- **Issues**: [GitHub Issues](https://github.com/mistersilver-uk/fabricate/issues)

## License

Fabricate is licensed under the PolyForm Noncommercial License 1.0.0 for noncommercial use.

Commercial use is not permitted under that license. If you use Fabricate in connection with a paid product, paid service, subscription, commissioned work, monetized content, or other commercial
activity, you need a separate commercial license.

Commercial licenses are handled through Patreon. If you need commercial rights, contact me with a brief description of your project and its expected or actual revenue. I will either direct you to an appropriate existing Patreon commercial license tier or create a suitable tier based on your revenue and use case.

Your commercial license remains active only while you maintain the required Patreon tier subscription. If that subscription ends, you must stop new commercial use of Fabricate unless we agree a
separate license in writing.

## Credits

Created by MisterSilver.
