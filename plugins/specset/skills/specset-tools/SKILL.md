---
name: specset-tools
description: Use when an agent should call Specset's own retrieval tools directly — semantic/keyword search and structured reads over specs, drawings, submittals, RFIs, documents, closeout, and schedule — via `specset tools` or a `specset mcp` server. Deeper than raw GraphQL search; lighter than delegating to the in-app agent.
allowed-tools: Bash Read AskUserQuestion
---

# Specset Agent Tools (`specset tools`, `specset mcp`)

These are the same read-only retrieval tools Specset's own in-app agent uses — exposed so external agents can call them directly.

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
specset tools list --org <slug>   # catalog for an org other than the active one
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

Tools use the selected organization on the chosen host, or infer the sole membership when none is selected. Pass `--org <slug|id>` on `tools list` and `tools run` to pin a different org — required when the project belongs to an org other than the active one (the call otherwise fails with "Project … not found"), and safer in parallel sessions because the active org is shared config.

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

`drawings download` also accepts `--org <slug|id>` to pin the source organization when parallel sessions might change the active organization, for example `specset drawings download P2.120 --project <id> --org specbook --host <host> --format pdf`.

To inspect an existing detail crop, add `--node <shortId|UUID>`, for example `specset drawings download <sheet-ref> --node d6 --format image --out detail.png`. Use `--format pdf` for the saved crop PDF. This downloads the current revision's stored crop without regenerating it; missing nodes or crops return an error. Node crops do not support `--format file`. JSON output adds the resolved `nodeId` to the normal sheet download metadata.

Its JSON result includes `sheetId` and `revisionId` for the downloaded source. Compare the revision with any previously retrieved content before using that content's coordinates to crop the download.

Typical loop for drawings: search or `getDrawingSheetContent` to find the sheet → hit a visual question the text can't settle → `drawings download` → read the PNG to inspect the geometry.

### Drawn elements: what a drawing view prints, with positions

Before downloading a plan to read a tag or a value off it, check the sheet's **drawn elements**: every printed string on each Drawing node with a 0–1000 box on the node's crop (the ledger), and the tags, runs, connections, cross-references, and printed limits typed from those strings. Each typed element cites ledger rows (`d1a12` = row 12 of node `d1`), so the printed text and its box are always the row's.

```bash
specset drawings elements show 'https://app.specbook.ai/go/drawing/<uuid>'            # per node: read/typing status, counts, tags, runs, connections, references, limits, keynotes
specset drawings elements show E6.00 --project <id> --node d1 --grep 800AT             # rows and elements whose text contains 800AT (implies --rows)
specset drawings elements show E6.00 --project <id> --rows --json                       # every row with kind, box, grid cell, rotation, cloud/revision flags
```

Read the status line first. A successful ledger read is evidence of printed text; absence claims also need the applicable completeness, recall, revision-cloud and source-coverage gates. Partial reads or unchecked coverage need visual confirmation. A version match alone does not mean a failed extraction succeeded.

Graph tools are automatically available with `--project` for eligible projects (every current drawing sheet uses extraction version 5 or newer; empty projects also qualify). Graphs refresh automatically. To request an immediate rebuild from existing extracted content:

```bash
specset drawings build-graph --project <id> --wait --timeout 1800 --host <host> --json
```

Omit `--wait` to return after requesting the build. Waiting confirms a newly persisted graph snapshot, not complete ingestion or review readiness; inspect the returned statistics and `getDrawingGraphOverview` for stale nodes and bundles before reviewing. The server build continues after a timeout, so inspect the overview before requesting another build. This does not reprocess drawings. The command requires the existing `resolveProjectDrawingGraph` and `projectDrawingGraph` server API; it and these instructions ride the next CLI release.

Use `getDrawingGraphOverview` to discover bundle keys, `getCoordinationBundle` for their views, `traverseDrawingReferences` for callout links, and `findDrawingGraphElements` for labeled, schedule-derived assets and rooms. For graphical devices, including unlabeled glyphs, use the candidate symbol lookup when ingestion and a graph rebuild have populated it:

```bash
specset tools run findDrawingGraphSymbols --project <id> --host <host> \
  -F canonicalTypes='["LightFixture","Sprinkler"]' -F sheetNumber=A5.01 -F limit=20
```

It returns source-linked boxes and their supporting legend definitions. You can also filter by `drawingArea`, `nodeId`, or a `scopeKey` returned by `getDrawingGraphOverview`; follow `nextOffset` when `hasMore` is true. These are incomplete candidate observations: zero results do not establish absence, matching types do not link devices across views, and returned counts are not verified physical totals. Confirm an issue-bearing interpretation by downloading and inspecting the source drawing with `specset drawings download <returned-link>`. The in-app visual analysis tool `examineDrawingSheets` is not exposed to external callers.

## MCP servers (local and hosted)

The same server-side tool registry is available through two transports:

- `specset mcp` is the local stdio transport for Claude Code, Codex, and other clients with shell access. It reuses the CLI login. Pass `--org <slug|id>` to pin the organization, or use the selected org / sole membership on the chosen host.
- `https://<specset-host>/mcp` is the stateless Streamable HTTP transport for hosted MCP clients. Its OAuth 2.1 consent flow selects an organization and binds it into the grant, so hosted clients must not put `orgId` in the connection URL. Add `projectId=<project-id>` to pin project scope.
- First-party clients may instead supply a Specset session bearer token and select the organization with `x-org-id` (or the legacy `orgId` query parameter).

Register the local transport once and the client can call the tools directly:

```bash
# Claude Code
claude mcp add specset -- specset mcp
# Optionally pin organization, project and host:
claude mcp add specset -- specset mcp --org <slug> --project <projectId> --host https://app.specbook.ai

# Codex
codex mcp add specset -- specset mcp
```

Notes:

- The server writes only the MCP protocol to stdout; diagnostics go to stderr.
- Scope (org, optional project, host) is fixed for the life of the server — restart it to change scope.
- If the session expires mid-run, tool calls return an actionable error; run `specset login` and restart the server.
- The hosted transport additionally exposes `uploadFile` (OpenAI host file parameters, streamed into Specset storage) and `getFileDownload` (an MCP resource link backed by a short-lived signed URL). The underlying retrieval tools are still the same allowlisted registry used by stdio.
- The hosted transport advertises standards-compliant MCP OAuth 2.1 protected-resource and authorization-server metadata. It supports Client ID Metadata Documents, PKCE, resource/audience binding, scoped tools, short-lived access tokens, and rotating refresh tokens.

## Scripting

Tools are discovered at runtime (`specset tools list`, MCP `tools/list`), and their descriptions and inputs are tuned for agents. For scripts that depend on a fixed response shape, use the typed `search` / `quickSearch` GraphQL queries in the `specset-search` skill.
