---
name: specset-search
description: Use when the user asks to find, look up, or locate anything in their Specset projects — semantic and keyword search across specs, drawing sheets, submittals, RFIs, documents, and closeout records.
allowed-tools: Bash Read AskUserQuestion
---

# Specset Search

This skill is read-only — everything here is a query, so nothing needs user confirmation before running.

`-F` sends strings only: inline enums, booleans, ints, and lists as literals in the operation text (Variable Limitations and Schema Discovery live in the `specset` skill).

## Choosing an Operation

- **`search`** — the main tool: semantic (natural-language) and/or keyword search over indexed content, results grouped by record type.
- **`quickSearch`** — fast flat matching against titles and identifiers; use when the user roughly knows the record's name or number.
- **Precise lookups** — when the user already has a spec section number or drawing sheet number, skip search and fetch directly.

> Need the actual content, not just previews and IDs? The `specset-tools` skill exposes Specset's own retrieval tools (`specset tools run searchSpecSections`, `searchDrawingSheets`, `searchDocuments`, …), which return expanded, citation-anchored markdown. Use `search`/`quickSearch` here to locate records cheaply; reach for `specset-tools` when you need to read and reason over the content.

## Unified Search: `search`

```graphql
search(
  orgId: ID!
  projectId: ID                      # required when projectScope is CurrentProject
  query: String                      # natural-language semantic query
  keywords: [String!]                # exact term matching — inline the list
  referenceTypes: [SourceReferenceType!]   # inline; omit to search all types
  projectScope: ProjectScope = CurrentProject
  titleOnly: Boolean = false
  limit: Int = 10
  offset: Int = 0
): SearchResults!
```

At least one of `query` or `keywords` is required; they can be combined. Results:

```graphql
{
  groups {
    referenceType
    totalCount
    items {
      id
      url
      title
      previewText
      score
      projectId
      projectName
    }
  }
  nextOffset
}
```

### Project Scope (`ProjectScope`)

- `CurrentProject` — default; `projectId` is required.
- `MyProjects` — every project the user is a member of in the org.
- `AllProjects` — every project in the org. Requires the org **Manager** or **Admin** role — plain Members get an authorization error, so fall back to `MyProjects` when that happens.

### Record Types (`SourceReferenceType`)

Filter semantic `search` with the record types it materializes: `SpecSection`, `DrawingSheet`, `Document`, `Submittal`, and `Rfi`. Other values exist in the shared `SourceReferenceType` enum but are not necessarily supported by this operation.

## Quick Search: `quickSearch`

Substring matching against titles and identifiers — cheap and fast, no semantic ranking.

```graphql
quickSearch(
  orgId: ID!
  projectId: ID
  query: String!
  referenceTypes: [SourceReferenceType!]
  projectScope: ProjectScope = CurrentProject
  limit: Int = 20
): QuickSearchResults!
```

Results: `{ items { id url number title referenceType score projectId projectName summary } totalCount }`

`quickSearch` also supports explicitly requested closeout title records: `Company`, `Location`, `System`, `Product`, `Asset`, and `MaintenancePlan`. It does not currently return `Warranty`, `Procedure`, or `WorkOrder` rows. `MaintenanceTask` is a deprecated legacy-link redirect, not a searchable record type. Omit `referenceTypes` for the standard global-search defaults, or introspect `SourceReferenceType` and use only a type supported by the selected operation.

## Precise Lookups

When the user hands you a section or sheet number, look it up directly:

```graphql
specSectionByNumber(projectId: ID!, sectionNumber: String!): SpecSection      # nullable
drawingSheetByNumber(projectId: ID!, sheetNumber: String!): DrawingSheet      # nullable
```

To browse or filter within a project, the paginated lists take `projectId`, an optional `search` string, and `limit`/`offset` ints; both return `{ items totalFilteredCount }`:

```graphql
paginatedSpecSections(projectId: ID!, search: String, limit: Int, offset: Int): SpecSectionPage!
paginatedDrawingSheets(projectId: ID!, search: String, limit: Int, offset: Int): DrawingSheetPage!
```

Useful item fields: `id sectionNumber title numberAndTitle` on SpecSection, `id sheetNumber title` on DrawingSheet.

## Example

```bash
specset api --query 'query($orgId: ID!) {
  search(orgId: $orgId, keywords: ["AHU-1"],
         referenceTypes: [Submittal],
         projectScope: MyProjects, limit: 20) {
    groups { referenceType totalCount
             items { id url title previewText projectName } }
  }
}' -F orgId=<org-id>
```

## Working With Results

- Each result's `id` is the UUID for follow-up GraphQL calls. Its `url` is the clickable source link (`https://app.specbook.ai/go/spec/<uuid>`, `https://app.specbook.ai/go/sub/<uuid>`, …) and can be passed directly into Specset tools and download commands.
- In user-facing answers, include the most relevant returned `url` values as descriptive Markdown source links so the user can open the result in Specset. Never synthesize a `/go` link from a UUID that was not returned as a source link.
- For follow-up work on what you found — updating submittals, answering RFIs, closeout records, or project/document changes — hand off to the `specset-submittals`, `specset-rfis`, `specset-closeout`, or `specset-projects` skill.
