---
name: specset-agent
description: Ask Specset's in-project AI agent questions that need deep project understanding — schedules, spec interpretation, cross-document analysis — via `specset agent chat`. Use when raw GraphQL isn't enough or when unsure how to answer from data.
allowed-tools: Bash Read AskUserQuestion
---

# Specset Agent Chat

Specset runs its own project-aware AI agent with full access to a project's specs, drawings, submittals, RFIs, and closeout data. `specset agent chat` sends it a message and waits for the full response — use it for questions that need Specset's own project understanding rather than raw data access.

## When to Delegate vs. Query Directly

Delegate to the agent when the answer requires reading and interpreting documents:

- Equipment and schedule extraction ("what mechanical equipment is scheduled on level 2?")
- Spec interpretation ("what are the submittal requirements in section 08 71 00?")
- Drawing analysis ("which sheets show the roof drainage details?")
- Drafting a submittal log from the specs (see the `specset-submittals` skill for applying the result)
- Comparing plan sets or revisions

Query directly with `specset api` when the user wants structured records — lists, lookups, creates, updates. The `specset-search`, `specset-projects`, `specset-submittals`, `specset-rfis`, and `specset-closeout` skills cover those workflows.

## Driving a Conversation

```bash
# Ask a question scoped to a project
specset agent chat --project <projectId> -m "What mechanical equipment is scheduled on level 2?"

# Continue the same conversation (thread id is in the first response)
specset agent chat --thread <threadId> -m "Which of those have submittals?"

# Attach local files to a new conversation or a follow-up message
specset agent chat --project <projectId> --file "RFI template.pdf" \
  -m "Use this template to draft the RFI."

# Review a past conversation
specset agent show <threadId>

# Download a generated document (artifact ids are included in agent show)
specset agent export <artifactId> --format docx --out ./filled-rfi.docx
specset agent export <artifactId> --format pdf --out ./filled-rfi.pdf

# Pin the host and organization when inspecting a local test run
specset agent show <threadId-or-link> --host https://app2.specset.dev --org <slug-or-id> --json

# Super-admin: inspect the current system prompt, tools, and model-input messages
specset agent inspect <threadId-or-link> --host https://app2.specset.dev --org <slug-or-id> --json
```

Use `--json` for machine-readable output (all commands accept it). Long-running questions may need `--timeout <seconds>` — document analysis can take a few minutes.

`--file <path>` uploads and attaches a file through the same processing flow as
the app. Repeat it for multiple attachments; PDF, Word, Excel and image MIME types
are inferred from the extension. It also works with `agent start` and with
`chat --thread` to attach files to an existing conversation. The upload belongs to
the thread's organization. Use `--detach` to return the thread id immediately
while the attachment processing and response continue.

`agent export` supports document artifacts in Word/PDF. Prepared templates retain
their original formatting; other documents are rebuilt from their saved markdown.
For documents edited in Pages, export in the app to preserve Pages layout,
headers, and notes. Other artifact types have their own export formats in the app.
A delegated draft has its own thread, so run `agent show` on the returned child
thread to find its artifact id.

Agent transcripts expose their source references as clickable `https://app.specbook.ai/go/...` links. Preserve the most relevant returned links as descriptive Markdown citations when relaying the answer to the user. Do not fabricate additional links from UUIDs. An identifier that is not an `https://` link (a thread-local short id or `doc:`-prefixed identifier) is internal — pass it back into commands verbatim, but never present it to the user as a clickable link. Both `--project` and `--thread` accept returned Specset links as well as UUIDs.

Find a project id first if you don't have one:

```bash
specset projects list --json
```

## Starting a Review Session Directly

Start a Quick Project Review investigation with an explicit brief and bounded
scope. Project Review remains a superadmin-only option in the agent picker;
shared organization and project access checks also apply.

```bash
specset agent start --type ProjectReview --project <projectId> --noAutoApprovePlan \
  --title "Building coordination pilot" \
  -m "Review Building 720.1 at Quick effort for cross-discipline coordination problems. Prioritize the strongest leads and report what you did not examine."
specset agent show <threadId>
specset agent approve <threadId> --tool finalizePlan --wait --timeout 1800
```

Pin the same `--host` on each command for a development deployment. Inspect the
short markdown plan before approving. Quick is the default: after approval, the
root investigates directly with drawing, graph, specification and document tools,
files issues, and reports examination limits. Standard and Deep use investigation
workers within the approved budget. All efforts use the agentic review route. Server step
backstops are not work targets or dollar caps; automatic issue verification follows
project policy and adds separate cost.

Drawing graph navigation is automatic for eligible projects. Use
`drawings build-graph --project <projectId> --wait` only for an explicit rebuild.
Inspect `getDrawingGraphOverview` bundles and quality flags before a benchmark;
building the graph does not reprocess stale source nodes. `--autoApprovePlan`
allows immediate execution when the brief is already approved.
`agent approve --deny --reason "…"` rejects a pending proposal for revision.
`agent stop <threadId>` cancels a running review and its descendants.

Long-running agents — Design Review, Drawing Review, Design Quality Review, Structured Review, Submittal Log — can be started as their own session without going through a Conversation thread. `specset agent start` creates the thread with the given `--type`, titles it, seeds it with your kickoff instructions, and returns immediately with the thread id; the run continues on the server.

```bash
specset agent start --type DesignReview --project <projectId> \
  --title "Building 720.1 - Design Review" --autoApprovePlan \
  -m "Run a design review restricted to the Building 720.1 spec and drawing areas. Omit the master / no-area pass. Building 720.1's own specifications govern; Appendix A is a backup reference only."

specset agent show <threadId>          # progress, transcript, findings so far

# A Drawing Review runs graph-planned coordination checks; select them up front.
specset agent start --type DrawingReview --project <projectId> \
  --coordinationTaskTypes ElectricalDistribution,ArchitectureMepPenetrations \
  --drawingArea "Building 720.1" --title "Building 720.1 - Coordination" \
  -m "Coordinate the selected systems for Building 720.1."
```

- `--type` accepts any top-level agent type (`DesignReview`, `DrawingReview`, `DesignQualityReview`, `StructuredReview`, `SubmittalLog`, …). The kickoff message is the review's scope: name the building areas, disciplines, sections or sheets, what to exclude, and any special coordination checks — the same text a user would type when launching the review in the app.
- `--type DrawingReview` also needs `--coordinationTaskTypes` (`all`, or a comma-separated subset of the 16 families: `CeilingOverhead`, `EquipmentPowerControls`, `LifeSafetyEgress`, `ArchitectureStructureOpenings`, `ArchitectureMepPenetrations`, `StructuralMepInterfaces`, `EnvelopeWaterproofing`, `FireLifeSafetyProtection`, `CivilSiteUtilities`, `ElectricalDistribution`, `MechanicalSystemsContinuity`, `PlumbingSystemsContinuity`, `StructuralSystemsContinuity`, `FireSuppressionSystemsContinuity`, `FireAlarmEmergencyCommunications`, `TechnologySecurityCommunications`). The server refuses a Drawing Review whose first message carries no scope, and the scope cannot change afterwards, so these flags apply only to new threads. `--drawingArea` limits the review to one building-scoped drawing area, and `--noDrawingArea` limits it to the sheets that belong to no drawing area (the site-wide set; exclusive with `--drawingArea`); `--coordinationTaskIds` narrows it to exact graph task ids for a bounded pilot or rerun (ids must belong to the selected families and area). `--executionIntent` decides how earlier reviews' runs of the same tasks are treated: `Reuse` (the default) answers a task from another review's completed run while the drawings it read are unchanged and leaves Blocked or Failed tasks alone (reported as incomplete), `RetryIncomplete` also re-runs those, and `Fresh` ignores earlier runs. The project needs a current drawing graph (`drawingCoordinationReviewAvailability.graphState` is `Ready`); otherwise the review cannot start.
- `--debugTrace` writes the thread's agent transcript and drawing-coordination trace to the development server's `.local/debug` for an investigation. `--noDebugTrace` turns it off for a continued thread; omitting the flag preserves its setting. Both flags also work with `agent chat`.
- Local Drawing Review kickoff uses the same required `--coordinationTaskTypes` and optional `--coordinationTaskIds` / `--drawingArea` flags as `agent start`. Pass them with the first message to `agent serve`; an existing thread keeps its original scope.
- `--autoApprovePlan` skips plan sign-off. To inspect a plan before execution, pass `--noAutoApprovePlan`: this also disables the CLI's default blanket tool approval, so the session parks at `finalizePlan`. Approve it with `agent approve <threadId> --tool finalizePlan`. Omitting the flag preserves the existing plan setting, but blanket approval defaults on. `--isolateIssues` hides the project's pre-existing issues; `--noIsolateIssues` explicitly restores ordinary issue reads. `--reviewEffort Quick|Standard|Deep` sets a Project Review's effort: Quick investigates the strongest few leads on the root; Standard covers the brief within an approved worker budget; Deep covers the whole surveyed inventory. The plan states the expected worker count and estimated worker cost for approval. Omitting it keeps the thread's setting (Quick for a new thread).
- `--scanParallelism <n>` sets a positive integer thread override for concurrent scan/coordination tasks (superadmin only). It uses the server's protected settings mutation, preserves other settings, and persists when later messages omit the flag. Each scan reads it at startup; changing it does not resize an already-running scan. For a scoped drawing-review benchmark, add `--scanParallelism 8` to the `agent start` command above or to `agent chat --type DrawingReview --timeout 2400`; select at least eight tasks to exercise that limit. It does not change the shared default or the review's internal visual/admission limits.
- `--title` names the session in Agent Sessions. `agent start` is `agent chat --detach` for a new thread; use `chat --type … --timeout …` instead when you want to wait for a short run to finish.

## Notes

- Keep one thread per topic: follow-ups via `--thread` give the agent the prior context and produce better answers than fresh threads.
- The agent may propose changes (creating submittals, updating records) but those are applied through the Specset UI thread where the user approves them — CLI chat is best treated as read/analysis oriented. To make changes headlessly, use the mutations documented in the domain skills instead.
- The agent answers from the project you scope it to; double-check the `--project` id when results look unrelated.

For local drawing evaluations, add `--freshVisualReads` to `agent chat` or `agent start` to make every drawing examination a fresh response. It bypasses application response caching only in development; provider prefix discounts remain enabled. Use `--noFreshVisualReads` to restore normal behavior on that task.

For the local comparison-reader arm, add `--drawingComparisonModel OpenAI6Astra` alongside `--freshVisualReads`. Only multi-view, region, or subject-window drawing examinations use Astra medium; single-view overviews keep normal routing. `--drawingComparisonModel Auto` clears that override on an existing task. This switch is ignored in production and does not change planner or worker reasoning models.

## Run agent threads locally with your own Claude Code / Codex

`specset agent serve` connects this machine to Specset. A conversation switched to **Execute locally** (conversation Settings) runs its model calls through the user's own coding harness (Claude Code or Codex) instead of a cloud model, while Specset keeps the agent loop, its tools, approvals and the transcript. Nothing else changes for the user: the thread stays the record.

Install the Codex runtime once (Node.js 22 or newer); Claude uses the runtime bundled with the CLI:

```bash
specset harness install codex      # pins the native Codex runtime under ~/.specset/harness
specset harness list               # what is installed, and which harness launched this shell
```

Codex uses `CODEX_PATH` when set, then `codex` on PATH, then the managed runtime. Claude uses the bundled SDK runtime, then `claude` on PATH. Log in to the harness itself first (`claude auth login`, `codex login`); provider failures such as an exhausted usage limit end the affected run with one visible error.

**When the user asks to run a thread locally**, start the runner in the background so your own tool timeout does not cut it off, then check the thread:

```bash
specset agent serve --host <deployment> --org <slug> --harness codex &   # or --harness claude
specset agent show <thread link>       # the transcript so far
```

What the harness spends is recorded on the thread as unbilled local usage (per model, priced for information only) and kept out of Specset's cost and credit figures.

### Native tools and the run workspace

Native tools are off by default: the harness only calls Specset functions, which the server authorizes and executes (approvals stay in the web app). Turn on **Native tools** in the conversation's Settings to let it also run shell commands and read, search or edit files. Each action is mirrored into the conversation as a local action card, and the thread's **Permissions** setting bounds what happens without asking: Read only, Accept edits, Auto (edits accepted, escalations reviewed) or Full access; for Codex these map to its sandbox (read-only, workspace-write, full access). Native sub-agents stay off; Specset's own sub-agent and fan-out tools run through the same machine.

Each run (a root thread and its children) works in one private directory under `--directory` (`~/.specset/personal-runs/<runner>/runs/<thread>/` by default) with `specs/`, `drawings/`, `docs/`, `inputs/` and `out/`. It starts empty. The `specset` CLI is logged in inside the session as the user for that host and organization, so the harness downloads what it needs: `specset specs download <ref> --out specs/`, `specset drawings download <ref> --format pdf --out drawings/`, `specset docs download <ref> --out docs/`, `specset files download <ref> --out inputs/`, or `specset projects hydrate <project> --out . --include specs,drawings,docs` for a whole project. `.specset/manifest.json` records each file's Specset link, version id and checksum; repeating a download is idempotent and replaces a stale version. Findings cite the Specset link, never the local path.

Files the harness writes under `out/` are the run's deliverables: after each turn that used native tools, and when the run ends, the runner uploads new or changed ones and attaches them to the root thread at their `out/…` path (a re-synced path replaces the earlier attachment). The workspace is removed once its run has ended (checked when the runner starts and stops and every ten minutes) or after seven untouched days; outputs that could not be attached keep the directory for a retry.

Sessions are ephemeral (`persistSession: false` for Claude, `ephemeral: true` for Codex): a restarted runner needs a new machine assignment and starts fresh sessions seeded from Specset's transcript. A lost native continuation fails visibly rather than replaying writes or switching to a cloud model. This is a personal runner executing project content as the local OS user, not an OS sandbox: use a separate account or host for untrusted content.

### Serve multiple local threads

Connect to an organization with `specset agent serve --host <host> --org <slug|id>`; no project or thread is required. Enable **Execute locally** in conversation Settings. A sole eligible connected runner automatically receives your queued local request; with multiple connected runners, choose **Machine** in Settings. The connection command disappears once a machine is connected. Completed, stopped, or expired runs offer **Start a new local run** above the composer; viewing them does not restart them. `--thread <id>` immediately assigns an existing root; `--message "Review electrical coordination" --type DrawingReview --coordinationTaskTypes ElectricalDistribution` creates a local root in the selected project. `--org <slug|id>` pins the org; otherwise the selected org or sole membership on that host is used. Omit `--project` for organization scope, or supply a comma-separated project allowlist. A new message-created thread requires exactly one project. Omit `--harness` to use that host’s saved default or its sole available native runtime; ambiguity requires an explicit choice. Claude uses the CLI’s bundled SDK runtime, then native `claude` on PATH. Codex uses `CODEX_PATH`, native `codex` on PATH, then the managed native runtime from `specset harness install codex`. Startup checks that runtime before registering. Run a separate `serve --host <deployment>` process for each dev worktree. Each process prints and pins its host/org/harness at startup; later CLI host/org changes cannot redirect it. Login, selected org, and harness defaults are stored per host; execution limits apply per runner. For a bounded smoke test, add `--stopAfterIssues 2`; the root counts issues across its children and stops that tree when the threshold is reached (an in-flight batch can exceed it). Only this signed-in user can assign work, and children inherit the same machine, project scope, deadline and thread budget.

`agent serve` uses server-owned orchestration: Temporal executes the agent and its tools, while model requests run through the connected machine. This includes generic drawing-coordination assessments, image inputs and structured output. The runner keeps a native session alive across each complete parallel tool batch and sends back the server's authorized results. All Specset approvals remain in the web app; native tools follow the thread's **Native tools** setting (see above) and native delegation stays off. Independent model requests use independent sessions. Claude uses `persistSession: false`; Codex uses `ephemeral: true`.

For an unattended kickoff, `--autoApprovePlan` skips the plan sign-off and `--autoApprove` approves Specset tools for that message (default off for `serve`). `--isolateIssues` ignores pre-existing project issues when planning a bounded test. The command prints the created or assigned thread link. File attachments and file tool results preserve bytes, MIME type and optional filename through the same transport. Claude receives raw PDFs; Codex receives server-rendered PDF page images, capped at 20 pages per request across all PDFs. Both support image inputs and UTF-8 text attachments. Other binary formats fail explicitly until a compatible reader or conversion is available.

Pin both `--host <deployment>` and `--org <slug>` when using `agent chat`, `agent start`, `agent show`, `agent inspect`, `agent approve` or `agent stop`; these overrides do not change the CLI’s saved selection.

The conversation's Settings lists the models the connected machine reported (Codex's catalog, Claude's supported models) and pins one per harness for the thread, plus a reasoning effort from that model's reported levels (agent steps only; helper calls keep the harness default); `--model` on the machine pins one for every job and shows as fixed there. `--concurrency` defaults to 5 and limits active model calls; tool and approval waits release their slot so even 1 can complete nested fan-out. `--maxThreads` defaults to 100 and `--maxRunSeconds` to 3600 per root authorization. `--model` is fixed on the machine. Specset’s `--autoApprove` message setting controls tool approval; the thread's Permissions setting bounds native tools when they are on. Ctrl-C revokes the registration and stops queued/running descendants. A restart needs a new assignment. A lost native continuation fails visibly rather than replaying writes or switching to a cloud model.

Harness tool callbacks can only wait for results supplied by the server. Each job receives private harness configuration and a minimal environment; with native tools on, that private home also holds a CLI login for the run's host and organization so `specset` works from the harness's shell. Claude shares the selected native credential store and its refresh lock. Codex uses an authentication-only native process to refresh the selected login, then supplies temporary access tokens to isolated inference sessions. Neither copies rotating refresh credentials into job homes. Settings, hooks, plugins and global MCP servers are excluded from inference sessions. Run `claude auth login` first if the harness reports authentication is required. It still runs as the local OS user, not inside an OS sandbox. Use a dedicated account or isolated host for untrusted project content; do not share this personal runner across users. This command requires the matching personal-runner and local-inference server APIs and ships in the next CLI release.

Use `specset agent runners list --json` to inspect your registrations.
Use `specset agent runners revoke <runner-id>` to stop and revoke one remotely, including an offline runner after a crash.
