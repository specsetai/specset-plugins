---
name: specset-submittals
description: Manage Specset submittals — list, search, create, revise, attach files, track approvers, and run AI spec-compliance reviews. Use for any submittal log or submittal review task.
allowed-tools: Bash Read AskUserQuestion
---

# Specset Submittals

How the data is shaped:

- `status` (SubmittalStatus: `Draft | Open | Closed`) is the log lifecycle; `workingStatus` (SubmittalWorkingStatus: `Draft | Submitted | Pending | Approved | ApprovedAsNoted | Rejected | ReviseAndResubmit | ForRecordOnly | Void`) is the ball-in-court state. Set either — the server reconciles the other.
- Revisions are separate submittal records sharing a `submittalNumber`; list and search queries return only the current revision.
- A submittal number is only unique per (spec section, number) within a project — the bare number alone is not.

The sketches below are minimal — inline enums, ints, and lists in the operation text (`-F` is strings-only; Variable Limitations and Schema Discovery live in the `specset` skill).

## Reading

```bash
# One submittal with its relationships
specset api --query 'query($id: ID!) {
  submittal(id: $id) {
    id submittalNumber sectionNumber title revision status workingStatus
    attachments { id description }
    approvers { id status comment returnedDate }
    submittalReviews { id status oneLiner lastReviewedAt }
  }
}' -F id=<submittal-id>

# Filtered list — enums inlined, never via -F
specset api --query 'query($projectId: ID!) {
  submittals(projectId: $projectId, statuses: [Open], workingStatuses: [Pending, Submitted]) {
    id submittalNumber sectionNumber title workingStatus submitByDate
  }
}' -F projectId=<project-id>
```

Also available:

- `paginatedSubmittals(projectId, search, limit: 25, offset: 0) { totalFilteredCount items { ... } }` — offset pagination with text search.
- `searchSubmittals(projectId, search)` — lightweight lookup by number or title; use it for dedupe checks.
- `submittalRevisions(projectId, submittalNumber, specSectionId)` — every revision of one number.
- `submittalTypes(projectId) { id name label }` — the project's configured types, for `submittalTypeId`.

## Creating

Dedupe first: run `searchSubmittals` with the submittal number (or title plus section). A match on (spec section, number) is authoritative — never create a duplicate; the API does not enforce this for you.

`createSubmittal(input: { projectId, title, submittalNumber, specSectionIds: [...], submittalTypeId, status }) { id submittalNumber title }` — omit `submittalNumber` to auto-number in the project's sequence.

**From a PDF**: upload it first (see Uploading Files in the `specset` skill) and pass the resulting file id as `cloudFileId` — Specset extracts the number, title, and section from the document, so you can omit them. Add `autoReviewMode: GeneratePlanAndApprove` to start an AI compliance review in the same call (`GeneratePlan` pauses at the plan for approval; default `None`).

Update with `updateSubmittal(input: { id, ... })` — same fields as create, minus `projectId`/`cloudFileId`. Pass only what changes.

## Revisions

`createSubmittalRevision` supersedes the current revision with a fresh one reset to Draft:

```bash
specset api --query 'mutation($id: ID!) {
  createSubmittalRevision(input: { id: $id, cloudFileIds: ["<file-id>"] }) {
    id revision status
  }
}' -F id=<submittal-id>
```

The revision string auto-increments (`0` → `1`, `A` → `B`); pass `revision` only when the document shows one that doesn't match. `autoReviewMode` works here too.

## Attachments

File ids come from Uploading Files in the `specset` skill.

- `createSubmittalAttachment(input: { submittalId, cloudFileId, type, description, order })`
- `createSubmittalAttachments(input: { submittalId, cloudFileIds: [...], autoReviewMode })` — batch form
- `updateSubmittalAttachment(input: { id, type, description, order })`
- `deleteSubmittalAttachment(id)`

`type` is a SubmittalAttachmentType enum (`ProductData`, `ShopDrawing`, `Certifications`, …) — introspect for the full list and inline the value.

## Approvers

Track who reviews the submittal and what they returned:

- `createSubmittalApprover(input: { submittalId, userId, dueDate, responseRequired }) { id order status }`

Record a returned response with `updateSubmittalApprover(input: { id, status: ApprovedAsNoted, comment: "...", returnedDate: "...", cloudFileIds: [...] })`. `status` is SubmittalApproverResponseStatus: `Approved | ApprovedAsNoted | ForRecordOnly | Pending | Rejected | ReviseAndResubmit | Void | Submitted`. `approverType` distinguishes `Approver` (default) from `Submitter`; `sentDate` and `distributed` track routing. Remove with `deleteSubmittalApprover(id)`.

## AI Compliance Reviews

Three steps — arguments are top-level (no input object):

1. `createSubmittalReview(submittalId, createMode: GeneratePlanAndApprove) { id }` — optional: `prompt` (focus instructions, a plain string), and `specSectionIds` / `drawingSheetIds` (inline lists) to pin the spec basis.
2. Poll `submittalReview(id) { id status oneLiner lastReviewedAt }` until `lastReviewedAt` is set — reviews take minutes; see Waiting on Background Processing in the `specset` skill for cadence. `status` is the verdict, ReviewStatus: `Compliant | NonCompliant | MissingInfo | ClarificationsNeeded | NotApplicable`.
3. `compileSubmittalReview(id, includeIssueToc: true) { id compiledReview { id } }` compiles the annotated, marked-up PDF. `excludedIssueIds: [...]` (inlined) drops chosen issues from the compiled PDF and TOC.

`updateSubmittalReview(id, comments)` records reviewer comments; `deleteSubmittalReview(id)` removes a review.

## Drafting a Whole Submittal Log

Generating a full log from the specs is an agent job, not raw GraphQL. Use the `specset-agent` skill and ask the in-app agent to draft a submittal log for the project — the run produces a SubmittalLog artifact on its thread. Read the drafted rows (each entry has a numeric id) with `agentArtifact(id) { id title content }`, let the user pick, then apply:

```bash
specset api --query 'mutation($artifactId: ID!) {
  applySubmittalLog(input: { artifactId: $artifactId, selectedSubmittalLogIds: [1, 2, 3] }) {
    id content
  }
}' -F artifactId=<artifact-id>
```

Applying skips rows whose (section, number) already exists and writes per-row results back onto the artifact — re-read `content` to report errors and warnings.

## Safety

`deleteSubmittal(id)` removes one revision; `deleteSubmittal(id, deleteAllRevisions: true)` removes the entire revision chain — state that difference when confirming the delete.
