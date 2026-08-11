---
name: specset-tools
description: Use when an agent should call Specset's own retrieval tools directly — semantic/keyword search and structured reads over specs, drawings, submittals, RFIs, documents, closeout, and schedule — via `specset tools` or a `specset mcp` server. Deeper than raw GraphQL search; lighter than delegating to the in-app agent.
allowed-tools: Bash Read AskUserQuestion
---

# Specset Agent Tools (`specset tools`, `specset mcp`)

These are the same read-only retrieval tools Specset's own in-app agent uses — exposed so external agents can call them directly. Everything here is read-only; nothing needs user confirmation.

## When to use which surface

There are three tiers of Specset retrieval. Pick the lightest one that answers the question:

1. **Typed GraphQL search** (`specset-search` skill: `search`, `quickSearch`, `specSectionByNumber`, …) — cheapest, returns previews and IDs. Best for "does X exist / find the record."
2. **Agent tools** (this skill) — the middle tier. `searchSpecSections` / `searchDrawingSheets` / `searchDocuments` return expanded, citation-anchored markdown (the real retrieval), and the `get*Content` tools read full sections. Best when you need the actual content to reason over.
3. **In-app agent** (`specset-agent` skill: `specset agent chat`) — heaviest. Delegates the whole question to Specset's agent, which reasons and synthesizes. Best when the answer needs cross-document judgment, not just retrieval.

## Listing tools

```bash
specset tools list
specset tools list --project <projectId|https://app.specbook.ai/go/project/...>
specset tools list --json     # full input schemas
```

The listing includes usage guidance and marks project-scoped tools. The exact set depends on the org (closeout and schedule tools require their SKUs) and on whether a project is in scope.

## Running a tool

Provide input as a JSON object (`--input`) or as repeated `-F key=value` fields. **Unlike `specset api -F` (strings only), `specset tools run -F` JSON-parses each value**, so numbers, booleans, and lists work:

```bash
# JSON input
specset tools run searchSpecSections \
  --project <projectId> \
  --input '{"query": "concrete curing requirements"}'

# Field form (values are JSON-parsed, string fallback)
specset tools run searchSpecSections --project <projectId> \
  -F query="fire rating" -F keywords='["ASTM E119"]' -F limit=5

# Read a specific section's full content using a source link from a search result
specset tools run getSpecSectionContent \
  -F id='https://app.specbook.ai/go/spec/<uuid>'
```

Output is the tool's JSON payload (`{ success, message?, result? }`); a `{ success: false }` payload exits non-zero.

### Source links

Tool results expose clickable links shaped like `https://app.specbook.ai/go/spec/<uuid>` or `https://app.specbook.ai/go/drawing/<uuid>`. Pass them back into other tools verbatim (for example, into `getSpecSectionContent` or `getDrawingSheet`). Include the most relevant returned links as descriptive Markdown citations in user-facing answers. Never invent a link or construct one from an unrelated UUID. An identifier that is not an `https://` link (a thread-local short id or `doc:`-prefixed identifier) is internal — pass it back into tools verbatim, but never present it to the user as a clickable link.

### Project scoping

Most tools are project-scoped. Either pass `--project` (a UUID or returned `/go/project/...` link), or include `projectId` in the tool input. Use `listProjects` to discover projects. With `--project` set, per-call `projectId` becomes optional.

## Downloading source files (drawings, documents, specs, submittals, RFIs)

The retrieval tools return **extracted text**, which is authoritative for schedules, notes, and spec paragraphs — but cannot answer spatial/visual questions (routing, clearances, what a plan view actually shows) and never carries the original file. Every entity has a download command, and **each accepts its returned Specset `/go` link verbatim** (citation focus parameters are ignored for downloads) or a bare UUID:

| Entity         | Command                                                                 | Also accepts                                     | Formats / options                                                                                                                       |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Drawing sheets | `specset drawings download 'https://app.specbook.ai/go/drawing/<uuid>'` | sheet number + `--project`                       | `--format image` (rendered PNG, default), `pdf` (single sheet), `file` (whole set)                                                      |
| Documents      | `specset docs download 'https://app.specbook.ai/go/doc/<uuid>'`         |                                                  | also covers RFI attachments and closeout documents                                                                                      |
| Spec sections  | `specset specs download 'https://app.specbook.ai/go/spec/<uuid>'`       | section number (e.g. `'23 31 19'`) + `--project` | per-section PDF slice (default), `--asset book` (whole source spec file)                                                                |
| Submittals     | `specset submittals download 'https://app.specbook.ai/go/sub/<uuid>'`   |                                                  | compiled package (default when present); `--list` shows the asset inventory; `--asset attachment --index 2`, `--asset attachment --all` |
| RFIs           | `specset rfis download 'https://app.specbook.ai/go/rfi/<uuid>'`         |                                                  | question + response attachments; `--list`, `--all`                                                                                      |
| File resources | `specset files download 'https://app.specbook.ai/go/file/<uuid>'`       |                                                  | escape hatch for a returned file source link                                                                                            |

All commands support `--json` (structured `{files: [{path, bytes, ...}]}` output) and `--out` (file path, or directory for multi-file downloads). A citation passed to the wrong command errors with the right one to use.

Typical loop for drawings: search or `getDrawingSheetContent` to find the sheet → hit a visual question the text can't settle → `drawings download` → read the PNG to inspect the geometry.

## MCP servers (local and hosted)

The same server-side tool registry is available through two transports:

- `specset mcp` is the local stdio transport for Claude Code, Codex, and other clients with shell access. It reuses the CLI login and active organization.
- `https://<specset-host>/mcp` is the stateless Streamable HTTP transport for hosted MCP clients. Its OAuth 2.1 consent flow selects an organization and binds it into the grant, so hosted clients must not put `orgId` in the connection URL. Add `projectId=<project-id>` to pin project scope.
- First-party clients may instead supply a Specset session bearer token and select the organization with `x-org-id` (or the legacy `orgId` query parameter).

Register the local transport once and the client can call the tools directly:

```bash
# Claude Code
claude mcp add specset -- specset mcp
# Optionally pin a project and/or host:
claude mcp add specset -- specset mcp --project <projectId> --host https://app.specbook.ai

# Codex
codex mcp add specset -- specset mcp
```

Notes:

- The server writes only the MCP protocol to stdout; diagnostics go to stderr.
- Scope (org, optional project, host) is fixed for the life of the server — restart it to change scope.
- If the session expires mid-run, tool calls return an actionable error; run `specset login` and restart the server.
- The hosted transport additionally exposes `uploadFile` (OpenAI host file parameters, streamed into Specset storage) and `getFileDownload` (an MCP resource link backed by a short-lived signed URL). The underlying retrieval tools are still the same allowlisted registry used by stdio.
- The hosted transport advertises standards-compliant MCP OAuth 2.1 protected-resource and authorization-server metadata. It supports Client ID Metadata Documents, PKCE, resource/audience binding, scoped tools, short-lived access tokens, and rotating refresh tokens.

## Stability

This surface is experimental — tool names and input schemas may change. For automation you need to keep stable, prefer the typed `search` / `quickSearch` GraphQL queries in the `specset-search` skill.
