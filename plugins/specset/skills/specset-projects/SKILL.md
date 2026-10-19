---
name: specset-projects
description: Use when standing up a new Specset project or adding document sets to one — create the project, upload spec/drawing PDFs, monitor processing, and publish spec sets and drawing sets.
allowed-tools: Bash Read AskUserQuestion
---

# Specset Projects

This skill mutates data — confirm the project name and which files belong to it before creating anything. Inline enums, ints, lists, and input objects in the operation text (`-F` is strings-only; Variable Limitations and Schema Discovery live in the `specset` skill).

## Find a project

Use `specset projects list --json` to list the active organization's projects with IDs and links. `--org <slug|id>` pins another organization, `--limit 20` bounds output, and `--archived` lists archived projects. Pass a returned ID or link to other project commands.

## Reading Projects

```graphql
projects(orgId: ID!, archived: Boolean, includeAll: Boolean = false): [Project!]!
paginatedProjects(orgId: ID!, search: String, limit: Int, offset: Int, archived: Boolean = false): ProjectPage!   # { items totalFilteredCount }
project(id: ID!): Project!
```

**`projects` is membership-filtered by default** — it returns only projects where the caller is a project member. Inline `includeAll: true` to list every project in the org. Use `paginatedProjects` with a `search` string to find a project by name.

## Creating a Project

`createProject` does **not** add the creator as a project member, so the new project won't appear in the default `projects` list until someone adds them — fetch it by `project(id)`. The `createProject` mutation takes `userIds` and `teamIds` to add members in the same call; `specset projects create` doesn't, so add them as a second step.

1. Create it with the project command (new projects support drawing graphs automatically):

```bash
specset projects create 'Riverside Medical Center' --json
```

Select the active organization first with `specset org use <slug>`. Pass `--host <url>` to both commands when targeting a specific deployment. JSON output includes `id`, `name`, and `drawingGraphEnabled`. Existing projects qualify when every current sheet supports graph resolution (node version 5 or later); ledger failures do not disable graphs.

2. Get your own user id with `{ me { id } }`, then add yourself (and anyone else the user names) as a member. `role` is an optional `OrgMemberTeamRole` enum — `Member`, `Manager`, or `Admin` — inlined when specified. To add several people or whole teams at once, use `addProjectMembers(projectId: ID!, userIds: [ID!], teamIds: [ID!])` (inline the lists); a team puts everyone on it on the project, and `teams(orgId)` lists them:

```bash
specset api --query 'mutation($projectId: ID!, $userId: ID!) {
  addProjectMember(projectId: $projectId, userId: $userId, role: Member) { id }
}' -F projectId=<project-id> -F userId=<user-id>
```

## Review Settings

Drawing graphs rebuild automatically as project inputs change. Automatic
verification of newly filed review issues is a platform setting managed by
Specset; it does not verify the existing queue. Project Review has no separate
project toggle; its availability in the app comes from the organization's
configured agents.

## Importing Documents

For an existing project, inspect drawing review readiness with `specset projects drawing-graph --project <id> --json`. Add `--rebuild` to queue resolution from already extracted drawing content; this does not start sheet extraction or element backfill. Re-run the command without mutation flags to inspect readiness after the background rebuild. Eligibility is automatic for new projects and existing projects whose current sheets are all at node version 5 or later. Pin `--host` and `--org` when targeting a particular deployment or organization.

Use the document-import command for local files; it uploads them, registers them on the project, and publishes the generated drawing/specification files automatically:

```bash
specset projects add-docs --project <project-id> ./drawings.pdf ./specifications.pdf --json
specset projects ingest-status --project <project-id> --wait --timeout 1800 --json
```

`add-docs` returns upload metadata and the background bulk action immediately. `ingest-status --wait` follows processing and publication; omit `--wait` for a snapshot. Processing extracts each document's outline and content, indexes it for search, and splits it into candidate spec files and drawing files by page range. The status command checks workflow completion and file publication; use drawing-element or graph tools to inspect content quality.

### `autoImport`: publish automatically or curate

- `autoImport: true` — every generated spec/drawing file is classified and published into default sets automatically. Use when the user wants everything live immediately.
- Pass `--noAutoImport` to `add-docs` — files land **unpromoted** for manual curation below. Use when the user wants to control set titles, membership, or ordering. The raw `createProjectDocuments` API defaults to unpromoted when `autoImport` is omitted.

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

## Downloading Project Material

`specset projects hydrate` pulls a project's source material into a local directory so an agent (or a person) can read the PDFs directly instead of fetching sections one at a time:

```bash
specset projects hydrate <projectId|link> --out ./pier-romeo            # specs/, drawings/, docs/
specset projects hydrate <projectId|link> --out ./pier-romeo --include specs,drawings
specset projects hydrate <projectId|link> --json                         # default --out: ~/Specset/<host>/<project-name>-<projectId>/
```

- `specs/` holds one PDF per spec section (`<number> - <title>.pdf`), `drawings/` one PDF per drawing sheet (`<sheet> - <title>.pdf`, the rendered image for legacy sheets), and `docs/` the project's other documents (reports, permits, manuals). The spec book and drawing set PDFs themselves are not repeated under `docs/` — fetch a whole book with `specset specs download <ref> --asset book` when needed.
- Re-running is idempotent: files already present at the stored size are skipped, so run it again after new documents are processed to pick up only what changed.
- `--json` returns `{ projectId, out, files: [{ path, kind, ref, bytes, sha256 }], skipped, failures }`; `ref` is the public link of the source entity. **Cite that link, never the local path**, when reporting findings from a downloaded file.
- Large projects can be hundreds of files; start with `--include specs` when only the specifications matter. A non-zero exit means some downloads failed — re-run the same command to retry just those.

## Archiving and Deleting

- **Prefer `archiveProject(id: ID!)`** — reversible via `unarchiveProject(id: ID!)`. Archived projects drop out of default lists but keep all data.
- **`deleteProject(id: ID!)` permanently destroys the entire project** — documents, specs, drawings, submittals, RFIs, everything. Confirm with the user, naming the exact project, before running it. If they just want it out of the way, archive instead.

## Troubleshooting

- Authorization error on a mutation — the user lacks that permission; the same rules as the UI apply. Surface the message, don't retry.
- A freshly created project "missing" from `projects` — that's the membership gotcha above, not a failure.
- A document reports a failed processing status on the BulkAction — report it to the user; re-uploading is their call.

Hydration records each file's Specset link, version id and checksum in `.specset/manifest.json`. Inside a local run's workspace (`specset agent serve` with **Native tools** on) the single `… download` commands record there too, and a version already present is not fetched again.
