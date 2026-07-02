---
name: specset
description: Drive Specbook AI headlessly via the specset CLI — authenticate, switch organizations, run GraphQL queries, and chat with Specbook project agents.
allowed-tools: Bash, Read, AskUserQuestion
---

# Specbook CLI (`specset`)

Use this skill to work with a Specbook AI organization from the command line: run GraphQL queries against your data (projects, drawings, specs, submittals, …) and hold conversations with Specbook's project agents.

The `specset` CLI handles OAuth login, org switching, and request signing. The exact flag surface of the installed version is authoritative in its own help output — prefer `specset --help` and `specset <command> --help` over memorized flags when something doesn't match this document.

## First-Run Setup

Perform this setup yourself when the user asks to get started with Specbook (or when a command fails because the CLI is missing or unauthenticated). Every step is idempotent — skip any that's already satisfied.

1. Ensure the CLI is installed:

```bash
which specset || npm install -g @specset/cli
```

Requires Node.js 20+ with npm. If `npm` itself is missing, stop and ask the user to install Node.js (https://nodejs.org) first.

2. Check authentication with `specset auth status`. If not logged in, start the login flow — it opens the user's browser; tell them to complete sign-in there while the command waits:

```bash
specset login
```

Login is interactive by design — never try to bypass it or handle credentials directly. On a headless machine (no browser), login isn't possible; direct the user to a machine with a browser. Don't launch a login mid-task without telling the user what's happening.

3. Pick the active organization (required for org-scoped queries):

```bash
specset org list
specset org use <slug>
```

If the user belongs to exactly one org, select it; otherwise ask which to use.

4. Confirm everything is ready:

```bash
specset auth status
```

Credentials persist across sessions in `~/.config/specset/config.yml` (mode 0600) — setup only needs to happen once per machine.

## Running GraphQL

Use the `api` subcommand. It accepts the operation via `--query` or stdin, and string variables via `-F key=value` (repeatable). Output is the raw JSON GraphQL response (`{ data, errors }`) — non-zero exit on HTTP errors or `errors[]`.

```bash
# Simple query
specset api --query '{ me { id email firstName } }'

# Query with an ID variable
specset api \
  --query 'query($id: ID!) { project(id: $id) { id name } }' \
  -F id=abc-123

# Long operation via stdin
specset api <<'GQL'
query {
  me { id email orgMembers { id org { id slug name } } }
}
GQL
```

### Variable Limitations

`-F key=value` only sends **string** values. For non-string args (numbers, booleans, enums, input objects, lists), inline literals directly in the operation rather than parameterizing them.

### Schema Discovery

Discover the API shape through introspection queries:

```bash
# Top-level queries
specset api --query '{ __schema { queryType { fields { name description } } } }'

# Fields on a specific type
specset api --query '{ __type(name: "Project") { fields { name type { name kind ofType { name } } } } }'

# Input object shape
specset api --query '{ __type(name: "CreateSubmittalInput") { inputFields { name type { name kind ofType { name } } } } }'
```

## Agent Chat

`specset agent chat` sends a message to a Specbook agent and waits for the full response — useful for asking questions that need Specbook's own project understanding (drawings, specs, schedules) rather than raw data access:

```bash
# Ask a question scoped to a project
specset agent chat --project <projectId> -m "What mechanical equipment is scheduled on level 2?"

# Continue the same conversation
specset agent chat --thread <threadId> -m "Which of those have submittals?"

# Review a past conversation
specset agent show <threadId>
```

Use `--json` for machine-readable output (all commands accept it). Long-running questions may need `--timeout <seconds>`.

## Safety Rules

- Default to read-only queries.
- Confirm with the user before executing mutations that create, update, or delete data.
- Never hardcode credentials in commands — the CLI manages tokens via OAuth.
- Tokens live in `~/.config/specset/config.yml`; do not echo or copy that file's contents.

## Troubleshooting

- `command not found: specset` — run the First-Run Setup above.
- `Not logged in` — run `specset login` (opens the user's browser; tell them to complete sign-in there).
- `No active organization selected` — run `specset org list`, then `specset org use <slug>`.
- Login requires a browser; on a headless machine, run the CLI from a machine with a browser first, or contact Specbook support about headless options.
- After upgrading the CLI (`npm i -g @specset/cli@latest`), refresh this skill with `specset skill install`.
