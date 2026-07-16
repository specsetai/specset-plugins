// Bump the mirror's plugin + marketplace manifest versions to match the
// published @specset/cli package. Only the version is synced — the
// marketplace-facing description/keywords/homepage are curated by hand here
// and intentionally differ from the npm package's own `description`.
//
// Usage: PKG_JSON=/path/to/package/package.json node write-manifests.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(process.env.PKG_JSON, 'utf8'));
const description =
  'Drive Specset via the specset CLI — search specs and drawings, set up projects, manage submittals, RFIs, and closeout data, chat with project agents, and administer your org. Supports browser and device-code sign-in; installs the CLI on first use.';

function patch(path, fn) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  fn(json);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

patch('plugins/specset/.claude-plugin/plugin.json', (j) => {
  j.description = description;
  j.version = pkg.version;
});

patch('.claude-plugin/marketplace.json', (j) => {
  for (const plugin of j.plugins ?? []) {
    if (plugin.name === 'specset') {
      plugin.description = description;
      plugin.version = pkg.version;
    }
  }
});
