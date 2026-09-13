# Cloudflare deployment

The Cloudflare Workers project `aierya` watches the GitHub `master` branch.
Its deploy command is `npx wrangler deploy`; `wrangler.jsonc` serves the
prebuilt game in `web-release/` directly as static assets.

`web-release/` contains the same production files as the GitHub Pages release
`6492c395611c551d818d215a9b1ea5516411f7dd` on `codex/pages`. It includes the
latest mobile interface, resource preload, audio, and combat balance changes.
The existing source build is separate from this reviewed release directory.

To publish a new game version, build the current development workspace and
replace `web-release/` with the contents of its `dist/` output. Commit that
release update to `master`; Cloudflare automatically deploys it. Only public
game assets belong in this directory.

GitHub Pages continues to serve the root of the `codex/pages` branch.
