---
name: specset-agent
description: Ask Specset's in-project AI agent questions that need deep project understanding — schedules, spec interpretation, cross-document analysis — via `specset agent chat`. Use when raw GraphQL isn't enough or when unsure how to answer from data.
allowed-tools: Bash Read AskUserQuestion
---

# Specset Agent Chat

Requires the `specset` CLI, logged in with an active org. If a command fails with `command not found`, `Not logged in`, or `No active organization`, follow First-Run Setup in the `specset` skill.

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

# Review a past conversation
specset agent show <threadId>
```

Use `--json` for machine-readable output (all commands accept it). Long-running questions may need `--timeout <seconds>` — document analysis can take a few minutes.

Find a project id first if you don't have one:

```bash
specset api --query 'query { projects { id name } }'
```

## Notes

- Keep one thread per topic: follow-ups via `--thread` give the agent the prior context and produce better answers than fresh threads.
- The agent may propose changes (creating submittals, updating records) but those are applied through the Specset UI thread where the user approves them — CLI chat is best treated as read/analysis oriented. To make changes headlessly, use the mutations documented in the domain skills instead.
- The agent answers from the project you scope it to; double-check the `--project` id when results look unrelated.
