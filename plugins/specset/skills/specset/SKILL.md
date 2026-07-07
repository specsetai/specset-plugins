---
name: specset
description: Core CLI for Specbook AI — install, authenticate, switch organizations, and run GraphQL with `specset api`. Start here for any Specbook/Specset task, and whenever a specset command fails with auth or org errors.
allowed-tools: Bash, Read, AskUserQuestion
---

# Specbook CLI (`specset`)

Use this skill to work with a Specbook AI organization from the command line: run GraphQL queries against your data (projects, drawings, specs, submittals, …) and manage authentication and org context.

The `specset` CLI handles OAuth login, org switching, and request signing. The exact flag surface of the installed version is authoritative in its own help output — prefer `specset --help` and `specset <command> --help` over memorized flags when something doesn't match this document.

## Skill Family

This is the core skill — setup and mechanics only. Domain workflows live in sibling skills:

| Skill | Use for |
|---|---|
| `specset-search` | Finding anything across specs, drawings, submittals, RFIs, documents, and closeout records |
| `specset-projects` | Creating projects, uploading spec/drawing PDFs, publishing spec and drawing sets |
| `specset-submittals` | Submittal lifecycle, attachments, approvers, and AI compliance reviews |
| `specset-rfis` | RFI logging, tracking, and responses |
| `specset-closeout` | Assets, locations, products, companies, warranties, and maintenance |
| `specset-agent` | Delegating deep project questions to Specbook's in-app AI agent |
| `specset-admin` | Org members, invites, and whitelabel branding |

`specset skill install` installs and updates the whole family (`specset skill list` shows what's bundled) — if a skill named above is missing from your skills directory, run it.

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

`-F key=value` only sends **string** values. For non-string args (numbers, booleans, enums, input objects, lists), inline literals directly in the operation rather than parameterizing them. Reserve `-F` for IDs and plain strings.

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

The domain skills document the operations that matter for each workflow, but they are not exhaustive — when an operation or argument doesn't match, introspect rather than guess.

## Uploading Files

Several workflows attach an uploaded file — submittal PDFs, RFI attachments, project documents, org logos. Files are uploaded directly to storage via a presigned URL, so attaching one is a three-step flow that needs `bash`, `curl`, and `jq`. The result is a **file id** you pass to whatever mutation consumes it.

1. Request a presigned upload URL:

```bash
specset api --query 'mutation($orgId: ID!) {
  generateFileUploadUrl(orgId: $orgId) { id url fields { key value } }
}' -F orgId=<your-org-id> > upload.json
```

2. POST the file to that URL with the returned form fields — the `file` field must come **last**:

```bash
URL=$(jq -r '.data.generateFileUploadUrl.url' upload.json)
ARGS=()
while IFS= read -r kv; do ARGS+=(-F "$kv"); done \
  < <(jq -r '.data.generateFileUploadUrl.fields[] | "\(.key)=\(.value)"' upload.json)
curl -sf -X POST "${ARGS[@]}" -F "file=@document.pdf" "$URL"
```

3. Finalize the upload to create the file record and capture its id:

```bash
UPLOAD_ID=$(jq -r '.data.generateFileUploadUrl.id' upload.json)
FILE_ID=$(specset api --query 'mutation($orgId: ID!, $id: ID!, $filename: String!) {
  completeUpload(orgId: $orgId, id: $id, filename: $filename) { id }
}' -F orgId=<your-org-id> -F id=$UPLOAD_ID -F filename=document.pdf | jq -r '.data.completeUpload.id')
```

Get your org id first if you don't have it:

```bash
specset api --query '{ me { orgMembers { org { id slug name } } } }'
```

## Waiting on Background Processing

Document imports and other bulk operations return a `BulkAction` and continue in the background. There are no subscriptions over `specset api` — poll with short sleeps and cap your retries:

```bash
specset api --query 'query($id: ID!) {
  bulkAction(id: $id) { totalCount completedCount failedCount }
}' -F id=<bulk-action-id>
```

Processing large PDF sets takes minutes; poll every 15–30 seconds and tell the user what's in flight rather than blocking silently.

## Safety Rules

- Default to read-only queries.
- Confirm with the user before executing mutations that create, update, or delete data.
- Never hardcode credentials in commands — the CLI manages tokens via OAuth.
- Tokens live in `~/.config/specset/config.yml`; do not echo or copy that file's contents.

## Troubleshooting

- `command not found: specset` — run the First-Run Setup above.
- `Not logged in` — run `specset login` (opens the user's browser; tell them to complete sign-in there).
- `No active organization selected` — run `specset org list`, then `specset org use <slug>`.
- A lookup by id returns `null` without an error — the record usually belongs to a different org than the active one; check `specset auth status` and switch with `specset org use <slug>`.
- Login requires a browser; on a headless machine, run the CLI from a machine with a browser first, or contact Specbook support about headless options.
- After upgrading the CLI (`npm i -g @specset/cli@latest`), refresh the skills with `specset skill install`.
