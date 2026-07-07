# Specbook AI Agent Skills

Teach your AI agent to work with [Specbook AI](https://specbook.ai): search your organization's specs and drawings, set up projects, manage submittals, RFIs, and closeout data, and chat with Specbook's project agents — all from Claude Code, Cursor, Codex, Gemini CLI, or any agent that supports the [Agent Skills](https://agentskills.io) standard.

The skills are self-bootstrapping: on first use they install the [`@specset/cli`](https://www.npmjs.com/package/@specset/cli) and walk you through signing in.

## Get started

**Claude Code:**

```
/plugin marketplace add specbookai/specset-skill
/plugin install specset
```

**Any other agent** — tell it to fetch and follow the core skill:

```
https://raw.githubusercontent.com/specbookai/specset-skill/main/plugins/specset/skills/specset/SKILL.md
```

(Or, with the CLI already installed: `specset skill install` copies every skill into `~/.claude/skills`, `specset skill list` shows what's available, and `specset skill print <name>` emits one to stdout.)

Then just ask your agent a question:

> *"What mechanical equipment is scheduled on level 2 of the Riverside project?"*

The first time, your agent will install the CLI (Node.js 20+ required) and open your browser to sign in to Specbook. After that, it's ready whenever you ask.

## The skills

The core `specset` skill covers setup, authentication, and running GraphQL. Domain skills add focused workflows and load only when relevant:

| Skill | Use for |
|---|---|
| `specset` | Setup, sign-in, org switching, and running GraphQL with `specset api` |
| `specset-search` | Finding anything across specs, drawings, submittals, RFIs, documents, and closeout records |
| `specset-projects` | Creating projects, uploading spec/drawing PDFs, publishing spec and drawing sets |
| `specset-submittals` | Submittal lifecycle, attachments, approvers, and AI compliance reviews |
| `specset-rfis` | RFI logging, tracking, and responses |
| `specset-closeout` | Assets, locations, products, companies, warranties, and maintenance |
| `specset-agent` | Delegating deep project questions to Specbook's in-app AI agent |
| `specset-admin` | Org members, invites, and whitelabel branding |

The skills default to read-only operations and ask before anything that changes data. Credentials are managed by the CLI via browser OAuth — the agent never sees or stores them.

## Versioning

These skills are published in lockstep with `@specset/cli` releases; the plugin version matches the CLI version. Claude Code picks up updates via `/plugin marketplace update`. If you installed via `specset skill install`, re-run it after upgrading the CLI.

## Support

Questions or issues: [https://specbook.ai](https://specbook.ai)
