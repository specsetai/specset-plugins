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
{ groups { referenceType totalCount items { url title previewText score projectId projectName } } nextOffset }
```

### Project Scope (`ProjectScope`)

- `CurrentProject` — default; `projectId` is required.
- `MyProjects` — every project the user is a member of in the org.
- `AllProjects` — every project in the org. Requires the org **Manager** or **Admin** role — plain Members get an authorization error, so fall back to `MyProjects` when that happens.

### Record Types (`SourceReferenceType`)

Filter with `referenceTypes`. Common values: `SpecSection`, `DrawingSheet`, `Document`, `Submittal`, `SubmittalAttachment`, `Rfi`, and the closeout types `Company`, `Location`, `Product`, `Asset`, `Warranty`, `MaintenanceTask`. Introspect the `SourceReferenceType` enum for the full list.

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
         referenceTypes: [Submittal, SubmittalAttachment],
         projectScope: MyProjects, limit: 20) {
    groups { referenceType totalCount
             items { url title previewText projectName } }
  }
}' -F orgId=<org-id>
```

## Working With Results

- Each result's `url` is a Specset reference URL (`sb://spec/<id>`, `sb://sub/<id>`, …); the UUID inside is the record's GraphQL `id` — extract it for follow-up queries. The scheme is documented in the `specset-tools` skill.
- For follow-up work on what you found — updating submittals, answering RFIs, closeout records, or project/document changes — hand off to the `specset-submittals`, `specset-rfis`, `specset-closeout`, or `specset-projects` skill.
