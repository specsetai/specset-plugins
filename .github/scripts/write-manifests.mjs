// Apply the mirror's curated marketplace description and match the plugin +
// marketplace manifest versions to the published @specset/cli package.
// Everything else in plugins/specset — both manifests, .mcp.json (the hosted
// MCP connector), the README, assets and skills — comes from the package's
// universal plugin bundle, which the workflow mirrors before this runs.
//
// Usage: PKG_JSON=/path/to/package/package.json node write-manifests.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(process.env.PKG_JSON, 'utf8'));
const description =
  'Search and manage Specset construction project data — specs, drawings, submittals, RFIs, documents, and closeout — with skills and MCP tools. Set up projects, chat with project agents, and administer your org. The skills install the specset CLI on first use for file transfers and record changes.';

function patch(path, fn) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  fn(json);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

patch('plugins/specset/.claude-plugin/plugin.json', (j) => {
  j.description = description;
  j.version = pkg.version;
});

const codexManifest = 'plugins/specset/.codex-plugin/plugin.json';
if (existsSync(codexManifest)) {
  patch(codexManifest, (j) => {
    j.version = pkg.version;
  });
}

patch('.claude-plugin/marketplace.json', (j) => {
  for (const plugin of j.plugins ?? []) {
    if (plugin.name === 'specset') {
      plugin.description = description;
      plugin.version = pkg.version;
    }
  }
});
