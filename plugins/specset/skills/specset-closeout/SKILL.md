---
name: specset-closeout
description: Use when managing Specset closeout and facilities data — assets, locations, products, companies, warranties, and maintenance tasks, plus their documents and links — for closeout package or O&M/facilities tasks.
allowed-tools: Bash, Read, AskUserQuestion
---

# Closeout & Facilities Data

Requires the `specset` CLI, logged in with an active org. If a command fails with `command not found`, `Not logged in`, or `No active organization`, follow First-Run Setup in the `specset` skill.

Run every operation with `specset api`. All ids are plain UUIDs. Remember Variable Limitations in the `specset` skill: `-F` sends strings only — inline every enum, number, boolean, list, and input object as a literal in the operation text, and reserve `-F` for ids and plain strings. This document is not exhaustive — when an operation or argument doesn't match, introspect (see the `specset` skill → Schema Discovery) rather than guess.

## Entity Model

**Locations** are the spatial scaffold (site → building → level → room), nesting via `parentId`. **Systems** are disciplines and equipment groups (HVAC, electrical, fire protection), also nested. **Products** are the spec'd make/models. **Assets** are installed instances: each asset sits at one location, is optionally an instance of one product with one responsible **company**, and can join multiple systems through role-tagged memberships. **Warranties** and **maintenance tasks** hang off assets, and maintenance tasks accumulate **completions** (service-log entries). Everything is scoped to a project.

## The Per-Entity Pattern

Asset, Location, Product, Company, System, Warranty, and MaintenanceTask share one surface:

| Operation | Shape |
|---|---|
| `<entity>(id: ID!)` | Single record (`null` if missing or in another org) |
| `paginated<Entities>(projectId: ID!, limit: Int, offset: Int, ...)` | Returns `{ items { ... } totalFilteredCount }` |
| `search<Entities>(projectId: ID!, search: String)` | Fuzzy text lookup |
| `create<Entity>(input: ...)` / `update<Entity>(input: ...)` | Update inputs take `id` plus only the fields to change |
| `delete<Entity>(id: ID!)` | Hard delete — see Safety |

Real deviations:

- **Asset** — create requires `projectId` + `locationId`. `paginatedAssets` also takes `search` and a `filters` input (`statuses`, `locationIds`, `productIds`, `systemIds`, `responsibleCompanyIds`, `parentIds`, `archived`) for cross-entity tracing.
- **Warranty / MaintenanceTask** — asset-scoped: create inputs take `assetId` (not `projectId`); no `search<Entities>` query, and `search` on their paginated lists is ignored — scope by asset with `warrantiesByAsset(assetId)` / `maintenanceTasksByAsset(assetId)` instead.
- Batch deletes exist for some entities (`deleteLocations(ids)`, `deleteCompanies(ids)`, `deleteSystems(ids)`, `deleteWarranties(ids)`, `deleteMaintenanceTasks(ids)`) — same confirmation rules as single deletes.

Introspect the input object before composing any create or update, e.g. `{ __type(name: "CreateAssetInput") { inputFields { name type { name kind ofType { name } } } } }`.

Worked example — find, then create:

```bash
specset api --query 'query($projectId: ID!) {
  paginatedAssets(projectId: $projectId, search: "AHU", limit: 20, offset: 0) {
    totalFilteredCount
    items { id tag status location { id name } product { id name } }
  }
}' -F projectId=<project-id>

specset api --query 'mutation($projectId: ID!, $locationId: ID!, $productId: ID!) {
  createAsset(input: {
    projectId: $projectId, locationId: $locationId, productId: $productId,
    tag: "AHU-1", status: Installed, quantity: 1
  }) { id tag status }
}' -F projectId=<project-id> -F locationId=<location-id> -F productId=<product-id>
```

Prefer `update<Entity>` for changes: pass `id` plus only what changes; pass `null` to clear an optional relationship (e.g. `productId: null`). Update inputs for Asset, Location, Product, Company, and System accept `archived: true` — a reversible soft-archive that drops the record from default lists. Prefer it over delete.

## Asset Links

Three `set*` mutations each **replace** the full id set for the given `(assetId, role)` tuple — anything previously linked at that role and not in the new list is removed; pass `[]` to clear. Inline the enum and the id list:

- `setAssetSystems(assetId: ID!, role: ..., systemIds: [ID!]!)` — roles: `Primary`, `Secondary`, `Control`, `MonitoredBy`, `Other`. Read back with `assetSystemMemberships(assetId)`.
- `setAssetSubmittals(assetId: ID!, relationship: ..., submittalIds: [ID!]!)` — relationships: `Source`, `Revision`, `Substitution`, `Addendum`. Read back with `assetSubmittalLinks(assetId)`.
- `setAssetDrawingSheets(assetId: ID!, role: ..., drawingSheetIds: [ID!]!)` — roles include `Plan`, `Schedule`, `Diagram`, `Detail`, `AsBuilt`, `Other`. Read back with `assetDrawingSheetLinks(assetId)`.

```bash
specset api --query 'mutation($assetId: ID!, $systemId: ID!) {
  setAssetSystems(assetId: $assetId, role: Primary, systemIds: [$systemId]) {
    id role system { id name }
  }
}' -F assetId=<asset-id> -F systemId=<system-id>
```

## Entity Documents

Each entity links to project documents through a role-tagged pivot. Find document ids with `documents(projectId: ID!) { id title }`. The pattern (uniform across Location, Product, Company, System, Warranty, MaintenanceTask; substitute the entity name):

- `<entity>Documents(<entity>Id: ID!)` — list the pivots. Select `{ id roles document { id title } }`.
- `set<Entity>DocumentRoles(<entity>Id: ID!, documentId: ID!, roles: [...]!)` — upsert the linkage; an empty `roles` list removes it (and the document itself if orphaned). Roles are per-entity enums — e.g. `ProductDocumentRole` is `Datasheet`, `InstallationManual`, `OperationManual`, `MaintenanceManual`, `Warranty`, `SubmittalPackage`, `Other`; introspect each entity's enum before use.
- `delete<Entity>Document(id: ID!)` — takes the **pivot** id from the list query, not the document id.

Asset is the exception: it has `assetDocuments(assetId)` and `deleteAssetDocument(id)` but no set-roles mutation.

## Documentation Blocks

Asset, Location, Product, Company, and System each carry a markdown documentation block used by closeout exports:

- `update<Entity>Documentation(id: ID!, markdown: String!)` — replace the block. Pass `markdown` via `-F` (it's a plain string).
- `mark<Entity>DocumentationComplete(id: ID!)` — attest the block is current (clears it from stale-documentation rollups).

## Maintenance Completions

Service history lives on completions under each task:

- `maintenanceTaskCompletions(maintenanceTaskId: ID!)` — select `{ id performedDate dueDate performedByName result }`.
- `createMaintenanceTaskCompletion(input: { maintenanceTaskId, performedDate, ... })` — `performedDate` is required; optional `dueDate`, `performedByName`, `performedByCompanyId`, `result`. Introspect `CreateMaintenanceTaskCompletionInput` for the full set.
- `updateMaintenanceTaskCompletion(input: { id, ... })` / `deleteMaintenanceTaskCompletion(id: ID!)`.
- Completion documents: `addMaintenanceTaskCompletionDocument(completionId: ID!, documentId: ID!)` and `deleteMaintenanceTaskCompletionDocument(id: ID!)` (pivot id).

## Dedup / Re-Pointing Recipe

For duplicate products P1 (loser) and P2 (survivor):

1. `paginatedAssets(projectId: ..., filters: { productIds: ["<p1-id>"] })` — collect affected assets.
2. `updateAsset(input: { id: ..., productId: "<p2-id>" })` per asset.
3. Re-run step 1 and confirm zero results.
4. `updateProduct(input: { id: "<p1-id>", archived: true })` — archive the loser; delete only if it is clearly an unreferenced mistake.

The same shape works for duplicate companies, locations, and systems.

## Safety

- Confirm with the user before every mutation. For deletes, name the exact record (tag/name + id) and get explicit approval — they are hard deletes with no undo.
- Prefer `update` over delete-and-recreate, and `archived: true` over delete: deleting a product, location, or company silently nulls the references on assets that pointed at it. Check impact first with the filtered list queries.
- Removing a document linkage can delete the underlying document if nothing else references it — say so when confirming.
