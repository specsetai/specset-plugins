# Specset Agent Skills

Teach your AI agent to work with [Specset](https://specset.com): search your organization's specs and drawings, set up projects, manage submittals, RFIs, and closeout data, and chat with Specset's project agents — all from Claude Code, Cursor, Codex, Gemini CLI, or any agent that supports the [Agent Skills](https://agentskills.io) standard.

The skills are self-bootstrapping: on first use they install or update the [`@specset/cli`](https://www.npmjs.com/package/@specset/cli) and walk you through browser or device-code sign-in.

## Get started

**Claude Code:**

```
/plugin marketplace add specsetai/specset-plugins
/plugin install specset
```

**Any other agent** — tell it to fetch and follow the core skill:

```
https://raw.githubusercontent.com/specsetai/specset-plugins/main/plugins/specset/skills/specset/SKILL.md
```

(Or, with the CLI already installed: `specset skill install` copies every skill into `~/.claude/skills`, `specset skill list` shows what's available, and `specset skill print <name>` emits one to stdout.)

Then just ask your agent a question:

> *"What mechanical equipment is scheduled on level 2 of the Riverside project?"*

The first time, your agent will install the CLI (Node.js 20+ required) and sign in to Specset. With a visible local browser it uses `specset login`; in a remote, headless, or in-app session where the browser is not visible, it uses device authentication:

```bash
specset login --device
```

The CLI prints a code and link that you can approve from any device. After that, it's ready whenever you ask.

## The skills

The core `specset` skill covers setup, authentication, and running GraphQL. Domain skills add focused workflows and load only when relevant:

| Skill | Use for |
|---|---|
| `specset` | Setup, sign-in, org switching, and running GraphQL with `specset api` |
| `specset-search` | Finding anything across specs, drawings, submittals, RFIs, documents, and closeout records |
| `specset-tools` | Calling Specset's retrieval tools directly (`specset tools`, `specset mcp`) — deeper than search, lighter than the in-app agent |
| `specset-projects` | Creating projects, uploading spec/drawing PDFs, publishing spec and drawing sets |
| `specset-submittals` | Submittal lifecycle, attachments, approvers, and AI compliance reviews |
| `specset-rfis` | RFI logging, tracking, and responses |
| `specset-closeout` | Assets, locations, products, companies, warranties, and maintenance |
| `specset-agent` | Delegating deep project questions to Specset's in-app AI agent |
| `specset-admin` | Org members, invites, and whitelabel branding |

The skills default to read-only operations and ask before anything that changes data. Credentials are managed by the CLI via browser OAuth — the agent never sees or stores them.

## Native tools (MCP)

Installing this plugin also registers a **native MCP server**, giving your agent direct access to Specset's read-only retrieval tools — semantic and keyword search over specs, drawings, submittals, RFIs, and documents (plus closeout and schedule where enabled), and structured reads of their content. This is the middle tier between raw GraphQL and delegating to the in-app agent: use it when you want the actual content to reason over.

The server runs the `specset` CLI (`specset mcp`), so it activates once the CLI is installed and you've signed in — both of which the skills handle on first use. Until then, Claude Code simply skips it (no error). After your first sign-in, restart Claude Code (or run `/reload-plugins`) for the tools to appear.

Need a non-default host or a pinned project? Register your own entry instead:

```bash
claude mcp add specset -- specset mcp --host <url> --project <id>
```

## Versioning

These skills are published in lockstep with `@specset/cli` releases; the plugin version matches the CLI version. Claude Code caches the marketplace and installed plugin separately, so refresh both from a terminal:

```bash
claude plugin marketplace update specset-plugins
claude plugin update specset@specset-plugins
```

Then run `/reload-plugins` in the active Claude Code session or restart it. Use the matching `--scope` with `claude plugin update` for a project- or local-scope install.

Updating the plugin does not replace an existing global CLI. Check `specset --version`; if it is older than the plugin, run `npm install -g @specset/cli@latest`. If you installed the skills directly with `specset skill install`, re-run `specset skill install --target claude` after upgrading the CLI.

> **This repository is generated — do not hand-edit `plugins/specset/**`.** The skills are the source that ships inside `@specset/cli` (`apps/cli/skills/*` in the CLI source repo). A scheduled workflow ([`.github/workflows/sync-from-npm.yml`](.github/workflows/sync-from-npm.yml)) pulls the latest published npm package and regenerates the mirror, so a new CLI release appears here within the hour. To change a skill, edit it in the CLI source repo and cut a release.

## Support

Questions or issues: [https://specset.com](https://specset.com)
