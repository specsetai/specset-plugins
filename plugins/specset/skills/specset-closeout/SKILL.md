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

Asset, Location, Product, Company, System, and Warranty link project Documents through entity-specific role-tagged pivots. Read `<entity>Documents(<entity>Id)`, then call `set<Entity>DocumentRoles(<entity>Id, documentId, roles)` after introspecting that entity's role enum (`AssetDocumentRole`, `ProductDocumentRole`, `SystemDocumentRole`, `LocationDocumentRole`, `CompanyDocumentRole`, `WarrantyDocumentRole`). The roles array is replaced atomically; an empty role list removes the pivot and may delete the underlying Document when it becomes orphaned. Asset also exposes `deleteAssetDocument(id)`.

Attaching a new file is a three-step flow — the same Document can then be linked to several entities (a family IOM shared by every product in the family):

```bash
CLOUD_FILE=$(specset files upload ./aaon-rn-iom.pdf --type application/pdf --json | jq -r .id)
specset api --query "mutation { createDocumentsFromCloudFiles(cloudFileIds: [\"$CLOUD_FILE\"], projectId: \"<project-id>\") { id title } }"
specset api --query 'mutation { updateDocument(id: "<document-id>", title: "AAON RN Series — IOM") { id } }'   # title drives lists and PDF bookmarks; the default is the filename
specset api --query 'mutation { setProductDocumentRoles(productId: "<product-id>", documentId: "<document-id>", roles: [OperationManual, MaintenanceManual]) { id } }'
```

Existing project Documents work too — a submittal attachment's `document { id }` (from `paginatedSubmittals … attachments { document { id title } }`) can be linked directly as `SubmittalPackage`/`Datasheet`; the only check is that the Document belongs to the same project. To bind a slice of a large file, `extractPagesFromFileResource(id: <fileResourceId>, pages: [3, 4, 5])` returns a new CloudFile to feed into `createDocumentsFromCloudFiles`. Only PDF files merge into the O&M package export; images and other types are listed as references.

Asset, Location, Product, Company, and System also have markdown documentation blocks. `update<Entity>Documentation(id, markdown)` replaces the block; `mark<Entity>DocumentationComplete(id)` attests that it is current. Any later create/update/link on the entity (a new document pivot, a warranty document, a field edit) marks the documentation stale again, so when seeding a graph write documentation **last**. Calling `mark<Entity>DocumentationComplete` with an empty block sets the state to `NotApplicable`, which the package readiness report accepts — use it for entities that don't warrant prose rather than writing filler.

### Writing documentation that reads well in the O&M package export

The rules below are the same ones the in-app documentation agent follows (they are one shared block; a test keeps this copy in sync).

### Where Documentation Renders

The documentation block renders on the entity's show page and in the compiled O&M closeout package PDF — a formal handover manual the owner's facilities team keeps for decades. The manual already prints the following from structured data, so documentation never restates it:

- Identity: tag, serial number, status, install and commissioning dates, quantity, location path, manufacturer, model, spec section, classification, data-package tier.
- Warranties: kind, start and expiration dates, duration, claims contact and the terms text.
- Maintenance schedule: every plan, procedure, frequency, craft and estimated hours, built from the maintenance plan records.
- Spare parts: name, SKU, manufacturer part number, quantity and vendor, from the part records.
- Contacts: the responsible company with phone and email, plus a per-system contacts rollup.
- Linked documents: every datasheet, manual, warranty and report, listed and bound directly behind the entity's page.

### What to Write

Spend the narrative on what tables cannot say: sequences of operation with real setpoints, startup and shutdown, seasonal and emergency procedures, troubleshooting, safety warnings, cross-system interfaces, and callouts where sources conflict. Describe the equipment, not the records — state how it works and how it is cared for, and fold genuine unknowns into one short "Open Items" list, one line each, without citations. A short block with two real sections beats a full template of filler: omit every section the sources don't genuinely cover, and leaving the block blank is a valid outcome for an entity with nothing to add.

Write for the building operator in plain language. Paraphrase manual procedures as proper markdown lists, and fix concatenation artifacts (double periods, misspelled manufacturer names) from sources.

Keep the block free of what the manual already prints and of anything that goes stale:

- No warranty terms or dates in prose, no frequency lists or task inventories, no tag/serial/model/quantity dossiers, no contractor names or phone numbers, and no parts tables pasted from manuals — replacement-parts data belongs in part records.
- No claims about the state of the records ("no dates are populated", "this task is recorded on the checklist") — they end up contradicting the printed tables.
- No restatement of the entity's `description` field as the opening — both print in sequence.
- No internal vocabulary ("portal", "normalized", "occurrence basis", "identity guard", "MaintenanceTask", "sourceMarkdown"), entity UUIDs, or extraction and slug references.
- No all-caps sentences or blockquote dumps of manual text, and no sections whose only content is "not established in reviewed source" or "see the linked manual".

### Citations

Citations are clickable in the app and plain text in the printed manual, so keep them sparse and short: at most one per section, placed at the end of the claim it supports, as a markdown link whose display text is a short label such as "Siemens O&M p. 712" or "Warranty Table p. 5". Use citation URLs exactly as returned by the tools. The entity's bound-documents list already anchors provenance, so there are no per-sentence citations, multi-citation parentheticals, full source filenames, paragraph numbers, spreadsheet cell references, or dedicated "Source:" lines (print strips those).

### Headings

The entity name renders as the page title, the block is embedded under a "Documentation" heading on the show page, and it may be re-rendered inside a parent entity's hierarchical view, so heading levels must compose:

- Top-level sections use `##`; sub-sections use `###`, then `####`, without skipping levels.
- Begin with the first content section (for example `## Description`). The entity's own name is never a heading and `#` is never used — that level is the page title, and a leading H1 matching the entity name is suppressed in print.
- Keep section names consistent with the templates below so sibling entities render with the same structure.

### Section Templates

Use these section orderings with the operator-facing names shown; most entities warrant only one to three of them.

**Product** — the canonical home for manufacturer operating knowledge. A product with any linked submittal, datasheet, manual or warranty document gets a block; only a product with no linked source documents is left blank. Location and system blocks may roll product knowledge up but never replace it.

```markdown
## Description        (1-3 sentences: what it is and its role — not metadata)
## Operation          (sequence of operation, setpoints, modes, interlocks)
## Routine Maintenance (procedure steps and precautions — never frequencies; the schedule table prints those)
## Troubleshooting
## Safety
## Open Items
```

**System** — the system in its own words, spanning multiple products. A parent system covers only what is true of the whole (shared operation, shared safety): the manual prints the subsystems list and rolls up schedules, warranties and contacts, so content common to sibling systems lives once on the parent and each child gets at most one sentence of scope.

```markdown
## Description        (what the system is and its boundary, 2-4 sentences)
## Sequence of Operation
## Interfaces         (only real cross-system relationships: what feeds, releases, or controls what)
## Seasonal & Emergency Procedures
## Troubleshooting
## Safety
## Open Items
```

**Location** — building or area overview.

```markdown
## Description
## Access & Safety
## Open Items
```

**Asset** — installation-specific facts only; most assets need very little.

```markdown
## As-Installed Configuration  (field settings, orientations, connections not captured by structured fields)
## Commissioning Notes
## Open Items
```

**Company** — only what the contacts block cannot carry.

```markdown
## Escalation
## Supplier Portal
```

### Example (Product)

```markdown
## Description
Passive rubber check valves preventing backflow from rivers, oceans, and storm water into outfall lines.

## Operation
Flow opens the bill section; back-pressure closes it. No power or operator action required. Do not exceed 25 psi back-pressure [Manual p. 3](sb://doc/...).

## Routine Maintenance
1. Clear debris from the bill opening.
2. Inspect the elastomer for cuts or abrasion; replace on any through-cut.

## Troubleshooting
Standing water upstream usually means debris is holding the bill open — clear before assuming valve failure.
```

## Parts and Meter Readings

`createPart(input: { projectId, name, sku, manufacturerPartNumber, unit, quantity, minQuantity, maxQuantity, unitCost, stocked, bin, vendorId, assetLinks: [{ assetId, quantity }] })` creates a stocked part with its per-asset quantities; `createPartMovement(input: { partId, quantity, note })` records receipts (positive) and consumption (negative), and `countedQuantity` records a cycle count. Read with `paginatedParts(projectId, filters)`.

`logMeterReading(assetId, unit: Hours|Cycles, value, readAt)` records a runtime or cycle reading; meter-triggered plan tiers (`meterUnit`/`meterThreshold`) generate work from these. `meterReadings(assetId, unit, limit)` lists them.

## Closeout Packages (O&M manual export)

A closeout package compiles the graph into one bookmarked PDF: front matter (cover, directory, warranty log, hyperlinked TOC), a slip sheet and overview per system (or location), a data page per asset, and every linked PDF document bound behind its owner (each unique file once). Scope is `Project` (everything), `Systems`, `Assets`, or `Locations` with `targetIds`; `orderingAxis` is `System` (default) or `Location`.

Check readiness first — it is deterministic and the same builder the compile uses, so a clean report means a clean manual:

```bash
specset api --query '{ closeoutPackageReadiness(projectId: "<project-id>", scopeKind: Project) { warningCount warnings } }'
```

Warning kinds and how to clear them: `DocumentationMissing`/`DocumentationOutdated` (write or mark documentation complete on the named Asset/Product/System/Location), `AssetFieldMissing` (serial number or install date), `WarrantyMissing` (every asset needs at least one Warranty), `ProductManualMissing` (each Product needs an `OperationManual` or `MaintenanceManual` document), `PlanWithoutProcedure` (a plan with no tiers), `AttachmentNotMergeable` (non-PDF), `TargetDeleted`. `EmptyScope` blocks creation.

```bash
specset api --query 'mutation { createCloseoutPackageExport(input: { projectId: "<project-id>", scopeKind: Project, orderingAxis: System, includeAttachments: true, title: "… O&M Manual" }) { id workflow { status } } }'
specset api --query '{ closeoutPackageExport(id: "<export-id>") { completedAt warnings workflow { status progress error } fileResource { id name } } }'
specset files download <file-resource-id> --out manual.pdf     # once workflow.status is Completed
```

`paginatedCloseoutPackageExports(projectId)` lists prior exports; exports are immutable records — regenerate by creating a new one; `deleteCloseoutPackageExport(id)` removes one and its file. In the app the same flow lives under the project's Closeout → Packages page.

## Enabling closeout

`CloseoutAuthService.isCloseoutActive` requires the org SKU **and** (unless the org is in `fmMode`) the project toggle. Both are superadmin operations; `updateOrg(skus)` replaces the whole SKU object, so read the current flags and resend them:

```bash
specset api --query '{ org(id: "<org-id>") { skus { closeout fmMode dailyLog scheduling estimation agentSessions agentSkills customAgents whitelabel modelRoutingV2 } } }'
specset api --query 'mutation { updateOrg(id: "<org-id>", skus: { closeout: true, dailyLog: true, scheduling: true }) { id } updateProject(id: "<project-id>", toolSettings: { closeout: true }) { id } }'
```

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
