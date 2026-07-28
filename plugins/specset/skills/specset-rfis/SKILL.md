---
name: specset-rfis
description: Manage Specset RFIs — list, search, create, update, and record responses including the official answer of record. Use for any RFI logging or tracking task.
allowed-tools: Bash Read AskUserQuestion
---

# Specset RFIs

How the data is shaped:

- An RFI is a `subject` + `question`, numbered within the project, with a lifecycle `status` (RfiStatus: `Draft | Open | Closed`).
- `rfiNumber` is unique within a project — `createRfi` rejects a duplicate outright.
- Responses accumulate on the RFI; exactly one can be marked **official** — the answer of record that justifies closing the RFI.

The sketches below are minimal — inline enums, ints, and lists in the operation text (`-F` is strings-only; Variable Limitations and Schema Discovery live in the `specset` skill).

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

`createRfi(input: { projectId, subject, question, status, specSectionIds: [...], drawingSheetIds: [...], dueDate }) { id rfiNumber subject status }`

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

- `createRfiResponse(input: { rfiId, body, attachmentCloudFileIds: [...] }) { id isOfficialResponse }`
- `updateRfiResponse(input: { id, body })` — edit a response body.
- `markRfiResponseAsOfficial(id)` / `unmarkRfiResponseAsOfficial(id)` — designate or revoke the answer of record. There is no official flag on create: create the response first, then mark it. The official response is normally the signed reply of record (typically the architect's or engineer's), not a discussion comment.
- `deleteRfiResponse(id)` — confirm with the user first.

The typical close-out sequence is: `createRfiResponse` → `markRfiResponseAsOfficial` → `updateRfi(input: { id, status: Closed })`.

## Attachments

Attachments on the RFI itself carry the question-side documents (sketches, photos, the original request PDF); response documents ride on the response via `attachmentCloudFileIds` above. Upload files per Uploading Files in the `specset` skill.

- `createRfiAttachment(input: { rfiId, cloudFileId })`
- `deleteRfiAttachment(id)`
- `reorderRfiAttachments(input: { rfiId, attachmentIds: [...] })`

## Safety

- `deleteRfi(id)` removes the RFI along with its responses and attachments. Prefer closing an RFI over deleting it; delete only on explicit instruction, after showing what will be lost.
- Marking or unmarking an official response changes the project's answer of record — name the response you're promoting before running it.
