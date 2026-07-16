---
name: specset-rfis
description: Manage Specset RFIs — list, search, create, update, and record responses including the official answer of record. Use for any RFI logging or tracking task.
allowed-tools: Bash Read AskUserQuestion
---

# Specset RFIs

Requires the `specset` CLI, logged in with an active org. If a command fails with `command not found`, `Not logged in`, or `No active organization`, follow First-Run Setup in the `specset` skill.

How the data is shaped:

- An RFI is a `subject` + `question`, numbered within the project, with a lifecycle `status` (RfiStatus: `Draft | Open | Closed`).
- `rfiNumber` is unique within a project — `createRfi` rejects a duplicate outright.
- Responses accumulate on the RFI; exactly one can be marked **official** — the answer of record that justifies closing the RFI.

The sketches below are minimal. When an operation or argument doesn't match, introspect rather than guess (see Schema Discovery in the `specset` skill). Enums, booleans, ints, and lists must be inlined in the operation text — reserve `-F` for IDs and plain strings (see Variable Limitations there).

## Reading

```bash
# One RFI with its responses
specset api --query 'query($id: ID!) {
  rfi(id: $id) {
    id rfiNumber subject question status dueDate costImpact scheduleImpact
    responses { id body isOfficialResponse createdAt }
    attachments { id }
  }
}' -F id=<rfi-id>

# Filtered list — enums inlined, never via -F
specset api --query 'query($projectId: ID!) {
  rfis(projectId: $projectId, statuses: [Open]) {
    id rfiNumber subject status dueDate
  }
}' -F projectId=<project-id>
```

Also available:

- `paginatedRfis(projectId, search, limit: 25, offset: 0) { totalFilteredCount items { ... } }` — offset pagination; `search` matches subject and number. Use it for dedupe checks.
- `nextAvailableRfiNumber(projectId)` — the next number in the project's sequence, as a string.
- `rfiResponses(projectId) { id body isOfficialResponse }` — every response across the project.

## Creating

Dedupe first: search `paginatedRfis` with the RFI number from the document. A match by `rfiNumber` within the project is authoritative — never create a duplicate.

```bash
specset api --query 'query($projectId: ID!, $search: String) {
  paginatedRfis(projectId: $projectId, search: $search, limit: 5, offset: 0) {
    totalFilteredCount
    items { id rfiNumber subject status }
  }
}' -F projectId=<project-id> -F search=RFI-000017
```

If the source document carries no number, omit `rfiNumber` and the project's numbering scheme assigns the next one (fetch `nextAvailableRfiNumber` first if the user wants to see it). Numbers you do supply are canonicalized — generic `RFI-` prefixes are normalized — so the stored value may differ slightly from your input; read `rfiNumber` back from the mutation result.

```bash
specset api <<'GQL'
mutation {
  createRfi(input: {
    projectId: "<project-id>"
    subject: "Clarify hollow metal frame anchor spacing"
    question: "Detail 5/A-501 shows anchors at 16 inches; spec 08 11 13 says 24. Which governs?"
    status: Draft
    specSectionIds: ["<spec-section-id>"]
    drawingSheetIds: ["<drawing-sheet-id>"]
    dueDate: "2026-08-01T00:00:00Z"
  }) { id rfiNumber subject status }
}
GQL
```

Field conventions:

- `status` defaults to `Draft`. Promote to `Open` when the RFI is formally issued; move to `Closed` only once the official response is recorded.
- `costImpact` and `scheduleImpact` are RfiImpact enums (`Yes | No`) — set them only when the user or source document states an impact explicitly; leave them unset otherwise.
- `rfiManagerId` assigns the managing org member.

Update with `updateRfi(input: { id, ... })` — same fields minus `projectId`; pass only what changes:

```bash
specset api --query 'mutation($id: ID!) {
  updateRfi(input: { id: $id, status: Open }) { id status }
}' -F id=<rfi-id>
```

## Responses

Responses form the answer trail. Attach the reply document via `attachmentCloudFileIds` (file ids come from Uploading Files in the `specset` skill):

```bash
specset api <<'GQL'
mutation {
  createRfiResponse(input: {
    rfiId: "<rfi-id>"
    body: "Use 16-inch anchor spacing per detail 5/A-501; the spec table is superseded."
    attachmentCloudFileIds: ["<file-id>"]
  }) { id isOfficialResponse }
}
GQL
```

- `updateRfiResponse(input: { id, body })` — edit a response body.
- `markRfiResponseAsOfficial(id)` / `unmarkRfiResponseAsOfficial(id)` — designate or revoke the answer of record. There is no official flag on create: create the response first, then mark it. Mark a response official only when it is the signed reply of record (typically the architect's or engineer's), not a discussion comment.
- `deleteRfiResponse(id)` — confirm with the user first.

The typical close-out sequence is: `createRfiResponse` → `markRfiResponseAsOfficial` → `updateRfi(input: { id, status: Closed })`.

## Attachments

Attachments on the RFI itself carry the question-side documents (sketches, photos, the original request PDF); response documents ride on the response via `attachmentCloudFileIds` above. Upload files per Uploading Files in the `specset` skill.

- `createRfiAttachment(input: { rfiId, cloudFileId })`
- `deleteRfiAttachment(id)`
- `reorderRfiAttachments(input: { rfiId, attachmentIds: [...] })`

## Safety

- Confirm with the user before every mutation (see Safety Rules in the `specset` skill) — creates included.
- `deleteRfi(id)` removes the RFI along with its responses and attachments. Prefer closing an RFI over deleting it; delete only on explicit instruction, after showing what will be lost.
- Marking or unmarking an official response changes the project's answer of record — name the response you're promoting before running it.
