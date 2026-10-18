---
name: specset-issues
description: Use when working with a Specset project's design-review issues from the CLI — listing the queue by severity, tier, or verification state, and reading each issue's verdict.
allowed-tools: Bash Read AskUserQuestion
---

# Specset Issues

Design reviews (Design Review, Drawing Review, Design Quality Review, Project Review) and issue-finding skills file **issues** on a project. Each issue can be **verified** by an adversarial agent that re-reads the cited sheets and sections and records a verdict — `Confirmed` or `Rejected` — with a short justification. New review issues are verified automatically; skill-run issues, issues filed before verification existed, and issues whose runs ended without a verdict are verified on demand.

## Reading the queue

```bash
specset issues list --project <projectId>                                   # active, non-Cleanup issues
specset issues list --project <projectId> --severity High,Medium --notVerified --limit 500
specset issues list --project <projectId> --thread <reviewThreadId> --json  # one review's findings
specset issues list --project <projectId> --thread <runThreadId> --org <slug>  # a skill run, by the id agent chat printed
```

- `--severity` takes a comma list (`High`, `Medium`, `Low`); `--notVerified` keeps only issues with no verdict; `--archived` switches to the archived set.
- `--thread` matches the thread and every review thread under it: a skill's issues belong to its delegated review, so the run id `specset agent chat` prints finds them directly. `--org` pins the organization like the other commands.
- Cleanup-tier issues (real but self-resolving, kept out of the review queue) are excluded unless you pass `--includeCleanup` — the same rule the app's default queue uses.
- The table shows `#number severity tier verdict title`; `verdict` is `Confirmed`, `Rejected`, `verifying` (run in flight) or `unverified`. `--json` returns the full rows including the originating review thread.

## Verification

Verdicts come from the app's own verification runs: new review issues are verified automatically, and a member can start verification for an individual issue from the issue in the app. `specset issues list` shows the verdict on every row (`--notVerified` to find the ones still waiting).
