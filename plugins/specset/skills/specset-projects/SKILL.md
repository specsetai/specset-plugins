---
name: specset-projects
description: Use when standing up a new Specset project or adding document sets to one — create the project, upload spec/drawing PDFs, monitor processing, and publish spec sets and drawing sets.
allowed-tools: Bash, Read, AskUserQuestion
---

# Specset Projects

Requires the `specset` CLI, logged in with an active org. If a command fails with `command not found`, `Not logged in`, or `No active organization`, follow First-Run Setup in the `specset` skill.

This skill mutates data — confirm with the user before each mutation, and always confirm the project name and which files belong to it before creating anything. Remember Variable Limitations from the `specset` skill: `-F` sends **strings only** — inline every enum, boolean, int, list, and input object as a literal; reserve `-F` for IDs and plain strings. When an operation or argument here doesn't match, introspect (see Schema Discovery in the `specset` skill).

## Reading Projects

```graphql
projects(orgId: ID!, archived: Boolean, includeAll: Boolean = false): [Project!]!
paginatedProjects(orgId: ID!, search: String, limit: Int, offset: Int, archived: Boolean = false): ProjectPage!   # { items totalFilteredCount }
project(id: ID!): Project!
```

**`projects` is membership-filtered by default** — it returns only projects where the caller is a project member. Inline `includeAll: true` to list every project in the org. Use `paginatedProjects` with a `search` string to find a project by name.

## Creating a Project

`createProject` does **not** add the creator as a project member, so the new project won't appear in the default `projects` list. Agents that miss this conclude the creation failed and create duplicates — don't. Fetch the new project by `project(id)`, and add membership as a separate step, mirroring the UI.

1. Create it:

```bash
specset api --query 'mutation($orgId: ID!, $name: String!) {
  createProject(orgId: $orgId, name: $name) { id name }
}' -F orgId=<org-id> -F name='Riverside Medical Center'
```

2. Get your own user id with `{ me { id } }`, then add yourself (and anyone else the user names) as a member. `role` is an optional `OrgMemberTeamRole` enum — `Member`, `Manager`, or `Admin` — inlined when specified:

```bash
specset api --query 'mutation($projectId: ID!, $userId: ID!) {
  addProjectMember(projectId: $projectId, userId: $userId, role: Member) { id }
}' -F projectId=<project-id> -F userId=<user-id>
```

## Importing Documents

1. Upload each PDF following Uploading Files in the `specset` skill. Each `completeUpload` returns a **cloud file id** — collect them.
2. Register the uploads on the project in a single call. The input object is inlined; ID variables are fine as its leaves:

```bash
specset api --query 'mutation($projectId: ID!, $f1: ID!, $f2: ID!) {
  createProjectDocuments(input: {
    projectId: $projectId
    cloudFileIds: [$f1, $f2]
    autoImport: true
  }) { id totalCount completedCount failedCount }
}' -F projectId=<project-id> -F f1=<cloud-file-id> -F f2=<cloud-file-id>
```

3. It returns a **BulkAction** — poll it per Waiting on Background Processing in the `specset` skill. Processing extracts each document's outline and content, indexes it for search, and splits it into candidate spec files and drawing files by page range.

### `autoImport`: publish automatically or curate

- `autoImport: true` — every generated spec/drawing file is classified and published into default sets automatically. Use when the user wants everything live immediately.
- Omit it (or `false`) — files land **unpromoted** for manual curation below. Use when the user wants to control set titles, membership, or ordering.

Ask the user when their intent is ambiguous — this choice changes what gets published. The input also supports folders: `parentFolderId` / `newFolderName` for flat imports, or `folderTree` + `files` to mirror a directory structure — introspect `CreateProjectDocumentsInput` for those shapes.

## Publishing Spec and Drawing Sets

Publishing promotes processed files into a SpecSet or DrawingSet container. After a non-autoImport run finishes:

1. Review what processing generated, and summarize it to the user before publishing:

```graphql
unpromotedSpecFiles(projectId: ID!): [SpecFile!]!        # { id title }
unpromotedDrawingFiles(projectId: ID!): [DrawingFile!]!  # { id title }
```

Empty lists mean processing hasn't finished, or `autoImport` already promoted everything.

2. Create a set and assign files into it (`issuedAt` is an optional DateTime — inline an ISO literal like `issuedAt: "2026-06-01T00:00:00Z"`):

```bash
specset api --query 'mutation($projectId: ID!, $title: String!) {
  createSpecSet(title: $title, projectId: $projectId) { id title }
}' -F projectId=<project-id> -F title='Issued for Construction'

specset api --query 'mutation($specSetId: ID!, $f1: ID!) {
  assignSpecFilesToSpecSet(specSetId: $specSetId, specFileIds: [$f1]) { id }
}' -F specSetId=<spec-set-id> -F f1=<spec-file-id>
```

The drawing side is symmetric: `createDrawingSet(title: String!, projectId: ID!, issuedAt: DateTime)` then `assignDrawingFilesToDrawingSet(drawingSetId: ID!, drawingFileIds: [ID!]!)`.

3. When a project has multiple sets (e.g. an addendum on top of the base issue), set which one governs. Pass the **complete** list of set ids, highest precedence first:

```graphql
updateSpecSetPrecedence(projectId: ID!, specSetIds: [ID!]!): [SpecSet!]!
updateDrawingSetPrecedence(projectId: ID!, drawingSetIds: [ID!]!): [DrawingSet!]!
```

4. Verify and summarize — query `project(id)` (not the membership-filtered `projects` list) with `specSets { id title }` and `drawingSets { id title }`, and report what was created.

## Archiving and Deleting

- **Prefer `archiveProject(id: ID!)`** — reversible via `unarchiveProject(id: ID!)`. Archived projects drop out of default lists but keep all data.
- **`deleteProject(id: ID!)` permanently destroys the entire project** — documents, specs, drawings, submittals, RFIs, everything. Never run it without explicit user confirmation that names the exact project ("delete Riverside Medical Center — permanently?"). If the user just wants it out of the way, archive instead.

## Troubleshooting

- Authorization error on a mutation — the user lacks that permission; the same rules as the UI apply. Surface the message, don't retry.
- A freshly created project "missing" from `projects` — that's the membership gotcha above, not a failure. Check `project(id)` before recreating anything.
- A document reports a failed processing status on the BulkAction — report it to the user; re-uploading is their call.
- A lookup by id returns `null` — the record belongs to a different org than the active one; check `specset auth status`.
