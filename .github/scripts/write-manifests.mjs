// Bump the mirror's plugin + marketplace manifest versions to match the
// published @specset/cli package. Only the version is synced — the
// marketplace-facing description/keywords/homepage are curated by hand here
// and intentionally differ from the npm package's own `description`.
//
// Usage: PKG_JSON=/path/to/package/package.json node write-manifests.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(process.env.PKG_JSON, 'utf8'));

function patch(path, fn) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  fn(json);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

patch('plugins/specset/.claude-plugin/plugin.json', (j) => {
  j.version = pkg.version;
});

patch('.claude-plugin/marketplace.json', (j) => {
  for (const plugin of j.plugins ?? []) {
    if (plugin.name === 'specset') {
      plugin.version = pkg.version;
    }
  }
});
