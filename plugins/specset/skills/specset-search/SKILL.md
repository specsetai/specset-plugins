---
name: specset-search
description: Use when the user asks to find, look up, or locate anything in their Specbook projects — semantic and keyword search across specs, drawing sheets, submittals, RFIs, documents, and closeout records.
allowed-tools: Bash, Read, AskUserQuestion
---

# Specbook Search

Requires the `specset` CLI, logged in with an active org. If a command fails with `command not found`, `Not logged in`, or `No active organization`, follow First-Run Setup in the `specset` skill.

This skill is read-only — everything here is a query, so nothing needs user confirmation before running.

Remember Variable Limitations from the `specset` skill: `-F` sends **strings only**. Inline every enum, boolean, int, and list as a literal in the operation text; reserve `-F` for IDs and plain strings. If an operation or argument below doesn't match what the server accepts, introspect rather than guess — see Schema Discovery in the `specset` skill.

## Choosing an Operation

- **`search`** — the main tool: semantic (natural-language) and/or keyword search over indexed content, results grouped by record type.
- **`quickSearch`** — fast flat matching against titles and identifiers; use when the user roughly knows the record's name or number.
- **Precise lookups** — when the user already has a spec section number or drawing sheet number, skip search and fetch directly.

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

### Project Scope (`ProjectScope`, inline it)

- `CurrentProject` — default; `projectId` is required.
- `MyProjects` — every project the user is a member of in the org.
- `AllProjects` — every project in the org. Requires the org **Manager** or **Admin** role — plain Members get an authorization error, so fall back to `MyProjects` when that happens.

### Record Types (`SourceReferenceType`, inline it)

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

To browse or filter within a project, the paginated lists take `projectId`, an optional `search` string, and `limit`/`offset` ints (inline the ints); both return `{ items totalFilteredCount }`:

```graphql
paginatedSpecSections(projectId: ID!, search: String, limit: Int, offset: Int): SpecSectionPage!
paginatedDrawingSheets(projectId: ID!, search: String, limit: Int, offset: Int): DrawingSheetPage!
```

Useful item fields: `id sectionNumber title numberAndTitle` on SpecSection, `id sheetNumber title` on DrawingSheet.

## Examples

Semantic search scoped to one project:

```bash
specset api --query 'query($orgId: ID!, $projectId: ID!, $q: String!) {
  search(orgId: $orgId, projectId: $projectId, query: $q,
         projectScope: CurrentProject, limit: 10) {
    groups { referenceType totalCount
             items { url title previewText score } }
    nextOffset
  }
}' -F orgId=<org-id> -F projectId=<project-id> \
   -F q='vibration isolation requirements for rooftop mechanical equipment'
```

Keyword search filtered to submittals, across all of the user's projects (note the inlined list, enums, and int):

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

Direct lookup by section number:

```bash
specset api --query 'query($projectId: ID!, $n: String!) {
  specSectionByNumber(projectId: $projectId, sectionNumber: $n) {
    id sectionNumber title numberAndTitle
  }
}' -F projectId=<project-id> -F n='23 05 48'
```

## Working With Results

- Each result's `url` is a Specbook reference URL — `sb://spec/<id>`, `sb://drawing/<id>`, `sb://sub/<id>`, `sb://rfi/<id>`, `sb://doc/<id>`, and so on. The UUID inside is the record's GraphQL `id`; extract it for follow-up queries on that record.
- Lookups by id are scoped to the **active org**: an id from a different org returns `null` rather than an error. If a known-good id comes back null, check `specset auth status` and switch orgs.
- For follow-up work on what you found — updating submittals, answering RFIs, closeout records, or project/document changes — hand off to the `specset-submittals`, `specset-rfis`, `specset-closeout`, or `specset-projects` skill.
