---
name: specset
description: Core CLI for Specset — install or update the CLI, authenticate with a browser or device code, switch organizations, and run GraphQL with `specset api`. Start here for CLI setup or raw GraphQL access, and whenever a specset command fails with auth or org errors.
allowed-tools: Bash Read AskUserQuestion
---

# Specset CLI (`specset`)

Use this skill to work with a Specset organization from the command line: run GraphQL queries against your data (projects, drawings, specs, submittals, …) and manage authentication and org context.

The `specset` CLI handles OAuth login, org switching, and request signing. The exact flag surface of the installed version is authoritative in its own help output — prefer `specset --help` and `specset <command> --help` over memorized flags when something doesn't match this document.

## Skill Family

This is the core skill — setup and mechanics only. Domain workflows live in sibling skills:

| Skill                | Use for                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `specset-search`     | Finding anything across specs, drawings, submittals, RFIs, documents, and closeout records                                          |
| `specset-tools`      | Calling Specset's own retrieval tools directly (`specset tools`, `specset mcp`) — deeper than search, lighter than the in-app agent |
| `specset-projects`   | Creating projects, uploading spec/drawing PDFs, publishing spec and drawing sets                                                    |
| `specset-submittals` | Submittal lifecycle, attachments, approvers, and AI compliance reviews                                                              |
| `specset-rfis`       | RFI logging, tracking, and responses                                                                                                |
| `specset-closeout`   | Assets, locations, products, companies, warranties, and maintenance                                                                 |
| `specset-agent`      | Delegating deep project questions to Specset's in-app AI agent                                                                      |
| `specset-admin`      | Org members, invites, and whitelabel branding                                                                                       |

`specset skill install --target <claude|codex|chatgpt>` installs and updates the whole family (`specset skill list` shows what's bundled) — if a skill named above is missing from your skills directory, run it for the current agent.

## First-Run Setup

Run this when the user installs or updates the skill/plugin, asks to get started with Specset, or when a command fails because the CLI is missing or unauthenticated. Every step is idempotent — skip any that's already satisfied.

1. **Install or update the CLI** (Node.js 20+). Installing a skill/plugin does not upgrade the npm package. If `specset --version` is missing or older than `npm view @specset/cli version`, run `npm install -g @specset/cli@latest` (don't replace a source-linked development CLI whose version is newer than npm). After upgrading, refresh the skills with `specset skill install --target <claude|codex|chatgpt>`.
2. **Authenticate** — check with `specset auth status`. If not logged in: `specset login` when a visible browser is available on this machine (tell the user to complete sign-in there while the command waits); `specset login --device` otherwise (SSH, containers, CI, remote/in-app sessions). Device login prints a code and a link (`https://<host>/device?code=XXXX-XXXX`) — show both to the user; the command completes once they approve. Codes expire after 15 minutes; rerun for a fresh one.
3. **Pick the active organization** (required for org-scoped queries): `specset org list`, then `specset org use <slug>`. If the user belongs to exactly one org, select it; otherwise ask which to use.
4. **Confirm** with `specset auth status`.

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

`-F key=value` only sends **string** values. For non-string args (numbers, booleans, enums, input objects, lists), inline literals directly in the operation rather than parameterizing them. Reserve `-F` for IDs and plain strings.

### Schema Discovery

The domain skills document the operations that matter for each workflow, but they are not exhaustive — when an operation or argument doesn't match, introspect rather than guess:

```bash
specset api --query '{ __type(name: "Project") { fields { name type { name kind ofType { name } } } } }'
```

The same pattern works for input objects (`inputFields`) and the top-level surface (`{ __schema { queryType { fields { name description } } } }`).

## Agent Tools and MCP

Beyond raw GraphQL, the CLI exposes Specset's own retrieval tools — semantic and keyword search with actual content to reason over, not just record previews — as direct commands (`specset tools`) and as a native MCP server (`specset mcp`). The `specset-tools` skill owns that workflow: tool listing, project scoping, the `-F` JSON-parsing difference, MCP registration, and the `sb://` citation convention.

## Uploading Files

Several workflows attach an uploaded file — submittal PDFs, RFI attachments, project documents, and org logos. Use the streaming upload command; it requests a presigned storage URL, sends the file without buffering it whole, finalizes the upload, and returns the **cloud file id** required by attachment mutations:

```bash
specset files upload ./document.pdf
specset files upload ./photo.jpg --type image/jpeg --json
```

The active organization is used automatically. With `--json`, read the id from `.id`; without it, the command prints the id. The optional `--type` defaults to `application/octet-stream`.

Hosted MCP clients that support OpenAI file parameters receive the equivalent `uploadFile` tool. Pass its returned `.cloudFileId` to domain mutations that accept attachment ids; its `.id` is an `sb://file/...` citation. `getFileDownload` returns an MCP resource link backed by a short-lived URL when the hosted client needs bytes back.

## Waiting on Background Processing

Document imports and other bulk operations return a `BulkAction` and continue in the background. There are no subscriptions over `specset api` — poll with short sleeps and cap your retries:

```bash
specset api --query 'query($id: ID!) {
  bulkAction(id: $id) { totalCount completedCount failedCount }
}' -F id=<bulk-action-id>
```

Processing large PDF sets takes minutes; poll every 15–30 seconds and tell the user what's in flight rather than blocking silently.

## Safety

Confirm with the user before executing mutations that create, update, or delete data. The domain skills note the mutations with non-obvious consequences.

## Troubleshooting

- Auth, org, or missing-CLI errors (`command not found`, `Not logged in`, `No active organization selected`, login hangs) — run the matching First-Run Setup step above.
- A lookup by id returns `null` without an error — the record usually belongs to a different org than the active one; check `specset auth status` and switch with `specset org use <slug>`.
