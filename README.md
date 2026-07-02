# Specbook AI Agent Skill

Teach your AI agent to work with [Specbook AI](https://specbook.ai): query your organization's projects, drawings, specs, and submittals, and chat with Specbook's project agents — all from Claude Code, Cursor, Codex, Gemini CLI, or any agent that supports the [Agent Skills](https://agentskills.io) standard.

The skill is self-bootstrapping: on first use it installs the [`@specset/cli`](https://www.npmjs.com/package/@specset/cli) and walks you through signing in.

## Get started

**Claude Code:**

```
/plugin marketplace add specbookai/specset-skill
/plugin install specset
```

**Any other agent** — tell it to fetch and follow this skill:

```
https://raw.githubusercontent.com/specbookai/specset-skill/main/plugins/specset/skills/specset/SKILL.md
```

(Or, with the CLI already installed: `specset skill print` emits the same skill, and `specset skill install` copies it into `~/.claude/skills`.)

Then just ask your agent a question:

> *"What mechanical equipment is scheduled on level 2 of the Riverside project?"*

The first time, your agent will install the CLI (Node.js 20+ required) and open your browser to sign in to Specbook. After that, it's ready whenever you ask.

## What your agent can do with it

- Run GraphQL queries against your Specbook organization's data
- Ask Specbook's own project agents questions that need drawing/spec understanding
- Switch between organizations and hosts

The skill defaults to read-only operations and asks before anything that changes data. Credentials are managed by the CLI via browser OAuth — the agent never sees or stores them.

## Versioning

This skill is published in lockstep with `@specset/cli` releases; the plugin version matches the CLI version. Claude Code picks up updates via `/plugin marketplace update`. If you installed via `specset skill install`, re-run it after upgrading the CLI.

## Support

Questions or issues: [https://specbook.ai](https://specbook.ai)
