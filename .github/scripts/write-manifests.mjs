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

// Native MCP tools. Installing the plugin registers a stdio MCP server that
// exposes Specset's read-only retrieval tools (search over specs, drawings,
// submittals, RFIs, documents, and more) to the agent directly. It shells out
// to the globally-installed `specset` CLI (`specset mcp`), which the bundled
// skills install and authenticate on first use — until then Claude Code simply
// skips the server, so there is no error if the CLI isn't present yet. Requires
// @specset/cli >= 0.4.0 (the release that adds the `mcp` subcommand). Curated
// here alongside `description` so it survives the hourly skills resync.
const mcpServers = {
  specset: {
    command: 'specset',
    args: ['mcp'],
  },
};

function patch(path, fn) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  fn(json);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

patch('plugins/specset/.claude-plugin/plugin.json', (j) => {
  j.description = description;
  j.version = pkg.version;
  j.mcpServers = mcpServers;
});

patch('.claude-plugin/marketplace.json', (j) => {
  for (const plugin of j.plugins ?? []) {
    if (plugin.name === 'specset') {
      plugin.description = description;
      plugin.version = pkg.version;
    }
  }
});
