# Cloudflare deployment

The Cloudflare Workers project `aierya` watches the GitHub `master` branch.
Its deploy command is `npx wrangler deploy`; `wrangler.jsonc` serves the
prebuilt game in `web-release/` directly as static assets.
Wrangler is pinned in `devDependencies` and `package-lock.json`, so the build
installs the complete publishing tool with `npm ci` instead of relying on an
on-demand npx installation.

`web-release/` contains the production build from the current development
workspace. The existing source build is separate from this release directory.

The September 13 balance update uses `assets/game-Cmu35DM-.js`:
- Slayer damage is 30% of the previous release.
- Summon damage is 150% of the previous release.
- Sustained formation damage is 150% of the previous release.
- Enemy health and attack start at the first-wave baseline and grow by 10%
  each wave, compounded, including waves after the campaign.
- Elite reinforcements increase by two per wave; earlier elite counts are
  retained as a floor when a later wave template has fewer elites.

To publish a new game version, build the current development workspace and
replace `web-release/` with the contents of its `dist/` output. Commit that
release update to `master`; Cloudflare automatically deploys it. Only public
game assets belong in this directory.

GitHub Pages continues to serve the root of the `codex/pages` branch.
