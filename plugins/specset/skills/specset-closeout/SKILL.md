---
name: specset-closeout
description: Use when managing Specset closeout and facilities data — assets, locations, products, companies, warranties, procedures, maintenance plans, work orders, and their documents and links.
allowed-tools: Bash Read AskUserQuestion
---

# Closeout & Facilities Data

Run every operation with `specset api`. All ids are plain UUIDs. Inline enums, numbers, lists, and input objects in the operation text (`-F` sends strings only; Variable Limitations and Schema Discovery live in the `specset` skill).

## Entity Model

**Locations** are the spatial scaffold (site → building → level → room), nesting through `parentId`. **Systems** are disciplines and equipment groups, also nested. **Products** are specified make/models. **Assets** are installed instances: each asset has a location, may reference a product and responsible company, and can join multiple systems. **Warranties** attach to assets.

Maintenance has three layers:

- **Procedure** — reusable checklist content: ordered typed fields, descriptions, and source references.
- **MaintenancePlan** — a schedule on exactly one Product, Asset, Location, or System. Product plans fan out to installed assets. Its `tiers` are independent schedule items that pair a Procedure with a calendar cadence, meter trigger, or both.
- **WorkOrder** — a concrete occurrence or ad-hoc job. Generated work orders snapshot their checklist fields, so history remains stable when a Procedure changes.

`MaintenanceTask` and its completion API no longer exist. Use Procedure, MaintenancePlan, and WorkOrder operations below.

## Discover Before Mutating

Input objects evolve, especially checklist fields and plan tiers. Introspect the relevant input before composing a mutation:

```bash
specset api --query '{
  createPlan: __type(name: "CreateMaintenancePlanInput") {
    inputFields { name type { kind name ofType { kind name } } }
  }
  tier: __type(name: "MaintenancePlanTierInput") {
    inputFields { name type { kind name ofType { kind name } } }
  }
  complete: __type(name: "CompleteWorkOrderInput") {
    inputFields { name type { kind name ofType { kind name } } }
  }
}'
```

Inline input objects and enums in the operation text. Use `-F` for UUIDs, dates, and other scalar strings.

## Core Closeout Records

Asset, Location, Product, Company, System, and Warranty retain the standard surface:

| Operation                                                           | Shape                                       |
| ------------------------------------------------------------------- | ------------------------------------------- |
| `<entity>(id: ID!)`                                                 | Single record; nullable when missing        |
| `paginated<Entities>(projectId: ID!, limit: Int, offset: Int, ...)` | `{ items { ... } totalFilteredCount }`      |
| `create<Entity>(input: ...)` / `update<Entity>(input: ...)`         | Update inputs take `id` plus changed fields |
| `delete<Entity>(id: ID!)`                                           | Hard delete; follow Safety below            |

Notable differences:

- Asset creation requires `projectId` and `locationId`. `paginatedAssets` accepts `search` and filters such as `statuses`, `locationIds`, `productIds`, `systemIds`, `responsibleCompanyIds`, `parentIds`, and `archived`.
- Warranty is asset-scoped; use `warrantiesByAsset(assetId)` to browse one asset's warranties.
- Location, Product, Company, System, and Asset updates support reversible `archived` state. Prefer archiving to deletion.
- Batch-delete availability varies. Introspect the mutation root rather than guessing an operation name.

Asset link setters replace the complete set for the given role/relationship; omitted ids are removed and `[]` clears the set:

- `setAssetSystems(assetId, role, systemIds)` / `assetSystemMemberships(assetId)`
- `setAssetSubmittals(assetId, relationship, submittalIds)` / `assetSubmittalLinks(assetId)`
- `setAssetDrawingSheets(assetId, role, drawingSheetIds)` / `assetDrawingSheetLinks(assetId)`

## Procedures

Use `procedure(id)` and `paginatedProcedures(projectId, filters, limit, offset)`. Procedure list filters include `search` and `archived`.

Create a reusable checklist with its fields atomically:

```bash
specset api --query 'mutation($projectId: ID!) {
  createProcedure(input: {
    projectId: $projectId
    name: "Quarterly AHU service"
    fields: [
      { name: "Inspect belts", fieldType: Checkbox }
      { name: "Record supply temperature", fieldType: Number, unit: "°F" }
    ]
  }) {
    id name updatedAt
    fields { id name fieldType position required }
  }
}' -F projectId=<project-id>
```

The fields' array order sets their `position`; neither `CreateProcedureFieldInput` nor `UpdateProcedureFieldInput` accepts a `position` property. `updateProcedure(input: { id, ... })` is partial for scalar fields. Supplying `fields` performs a full checklist replacement; first read the current fields and include the `id` of every row that should retain its identity. `deleteProcedure(id, force)` is guarded when active plans use it. Do not set `force: true` without naming the affected plans and confirming the destructive change.

## Maintenance Plans and Tiers

Read with `maintenancePlan(id)`, `paginatedMaintenancePlans(projectId, filters, limit, offset)`, or `maintenancePlansForAsset(assetId, includeProductPlans)`.

Create requires exactly one subject id (`productId`, `assetId`, `locationId`, or `systemId`) and a `frequencyKind`. Prefer `tiers`; the top-level procedure and interval fields remain a single-item compatibility surface. Supply either:

- single-tier compatibility fields: `procedureId` (or inline `procedure`) plus `intervalValue` / `intervalUnit`; or
- `tiers: [MaintenancePlanTierInput!]` for independent schedule items. Each item selects one `procedureId` or creates one inline.

Do not mix `tiers` with the single-tier procedure/cadence fields. Calendar item units are `Days`, `Weeks`, `Months`, or `Years`. Optional meter conditions live on each item as the pair `meterUnit` (`Hours` or `Cycles`) and `meterThreshold`; provide both or neither. Calendar cadences are independent and do not need to be multiples of one another. Set `skipLowerTiersOnSharedDate: true` to suppress a shorter calendar item when it naturally shares a date with a longer one; each work order still contains only its own Procedure. A suppressed item's meter condition stays armed and may create that item's work order later. `gateOnOpen` prevents repeated meter-generated work while an occurrence remains open.

```bash
specset api --query 'mutation($assetId: ID!, $monthlyId: ID!, $quarterlyId: ID!) {
  createMaintenancePlan(input: {
    assetId: $assetId
    name: "AHU PM program"
    frequencyKind: Calendar
    skipLowerTiersOnSharedDate: true
    gateOnOpen: true
    tiers: [
      { procedureId: $monthlyId, intervalValue: 1, intervalUnit: Months }
      {
        procedureId: $quarterlyId
        intervalValue: 3
        intervalUnit: Months
        meterUnit: Hours
        meterThreshold: 500
      }
    ]
  }) {
    id name frequencyKind skipLowerTiersOnSharedDate gateOnOpen
    tiers {
      id intervalValue intervalUnit meterUnit meterThreshold
      procedure { id name }
    }
    openWorkOrderCount
  }
}' -F assetId=<asset-id> -F monthlyId=<procedure-id> -F quarterlyId=<procedure-id>
```

For a meter-only plan, prefer the typed input: `schedule: { meter: { unit: Hours|Cycles, threshold: <n>, gateOnOpen } }` with a single tier. The legacy encoding (`frequencyKind: RuntimeHours` or `Cycles`) additionally requires plan-level `intervalValue` set to the threshold and `intervalUnit: Hours`/`Cycles` — a threshold on the item alone is rejected. For an on-demand plan, use `AsNeeded`, `EventTriggered`, or `Other` and omit calendar and meter fields.

`updateMaintenancePlan(input: { id, ... })` can retarget the subject: pass exactly one of `productId`/`assetId`/`locationId`/`systemId` (same project). Open work orders for the old subject are retired — untouched ones removed, in-progress ones canceled — and fresh chains generate for the new subject. Supplying `tiers` fully replaces the schedule-item set: include the `id` of every existing item to update/retain, omit an item only when it should be removed, and omit `id` only for new items. Read the plan and its item ids immediately before updating.

Use `createWorkOrderFromPlan(planId, targetAssetId, dueDate, coveredTierIds)` for an early/manual occurrence of a plan. Product plans require the concrete `targetAssetId`. `coveredTierIds` is optional; when supplied it states exactly which tiers the occurrence performs.

## Work Orders

Use `workOrder(id)`, `paginatedWorkOrders(projectId, filters, limit, offset)`, and `paginatedGroupedWorkOrders(projectId, groupBy, groupKeys, filters, limit, offset)`. Grouped reads require both the grouping dimensions and the current group-key path. Useful fields include `status`, `dueDate`, `performedDate`, `priority`, `assignee`, `plan`, `planTier`, `coveredTiers`, `fields`, and `documents`.

`createWorkOrder(input)` creates ad-hoc work and requires exactly one of `assetId`, `locationId`, or `systemId`, plus `name`. Optional `fields` create a reusable inline Procedure; optional `recurrence` also creates a MaintenancePlan. Use `updateWorkOrder(input: { id, ... })` for editable metadata.

Checklist responses use `setWorkOrderFieldResponse(input)` or `setWorkOrderFieldResponses(inputs)`. Introspect `SetWorkOrderFieldResponseInput`: answer columns vary by field type (`valueNumber`, `valueText`, `valueChoice`, `status`, and `note`).

Complete work through the batch mutation even for one row:

```bash
specset api --query 'mutation($id: ID!, $performedDate: DateTime!) {
  completeWorkOrders(inputs: [{ id: $id, performedDate: $performedDate }]) {
    workOrder { id status performedDate }
    nextWorkOrder { id status dueDate }
  }
}' -F id=<work-order-id> -F performedDate=2026-08-04
```

Other lifecycle operations:

- `skipWorkOrder(id, notes, mode)` — closes the occurrence as skipped; omit `mode` for normal independent-item plans. Non-default modes exist only for historical merged work orders.
- `reopenWorkOrder(id)` — reopens completed/skipped work when allowed.
- `makeWorkOrderRecurring(workOrderId, recurrence)` — converts eligible ad-hoc work into a recurring plan.
- `deleteWorkOrder(id)` — hard delete.
- `bulkAssignWorkOrders(selection, assigneeId)` and `bulkDeleteWorkOrders(selection)` operate on an explicit selection object.
- `addWorkOrderDocument(workOrderId, documentId, workOrderFieldId)` and `removeWorkOrderDocument(id)` manage evidence. Removal takes the WorkOrderDocument pivot id.

## Entity Documents and Documentation

Location, Product, Company, System, and Warranty link project Documents through entity-specific role-tagged pivots. Read `<entity>Documents(<entity>Id)`, then call `set<Entity>DocumentRoles(<entity>Id, documentId, roles)` after introspecting that entity's role enum. An empty role list removes the pivot and may delete the underlying Document when it becomes orphaned. Asset is the exception: it exposes `assetDocuments(assetId)` and `deleteAssetDocument(id)`, but no set-roles mutation.

Asset, Location, Product, Company, and System also have markdown documentation blocks. `update<Entity>Documentation(id, markdown)` replaces the block; `mark<Entity>DocumentationComplete(id)` attests that it is current.

## Dedup / Re-pointing

For duplicate products P1 (loser) and P2 (survivor):

1. Query `paginatedAssets(projectId, filters: { productIds: [P1] })` and collect impacted assets.
2. `updateAsset(input: { id, productId: P2 })` for each asset.
3. Re-run the filtered query and confirm zero remaining references.
4. Archive P1 with `updateProduct(input: { id: P1, archived: true })`.

Use the same impact-first pattern for duplicate companies, locations, and systems.

## Safety

- Deletes are hard and have no undo. Before executing, name the exact record and id and confirm the impact.
- Prefer partial updates, and prefer `archived: true` to delete where supported.
- Read Procedure fields and MaintenancePlan tiers before any full-replacement update.
- Deleting plans or force-deleting Procedures can alter future generated work. Check active plan/open-work-order counts first.
- Removing a document linkage can delete an orphaned underlying Document; disclose that before confirming.
