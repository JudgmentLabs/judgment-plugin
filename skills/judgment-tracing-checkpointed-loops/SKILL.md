---
name: judgment-tracing-checkpointed-loops
description: Use when adding or auditing Judgment tracing for a long-running autonomous agent loop that durably saves iterations or checkpoints and resumes after process death. Covers one root per durable decision step, run sessions, compaction, model/tool children, background async-context detachment, per-step flush, and restart-instance evidence.
---

# Judgment Tracing for Checkpointed Agent Loops

Read
`references/checkpointed-agent-loops.md`
completely before editing. Treat a durably saved decision iteration—not the
process lifetime or initial HTTP request—as the default trace boundary.

## Required model

- Use one fresh parentless root per completed durable iteration.
- Start before the model decision and end after the resulting action/error and
  updated state are durably saved.
- Set the stable run ID as `judgment.session_id` on every iteration before and
  after restart.
- Represent compaction and finish as real iteration roots, not hidden metadata.
- Keep start/resume HTTP traces separate from background loop work and exclude
  repeated status polling.

## Semantic root floor

Root input is a bounded safe goal plus the state needed to understand the
decision. Root output must include the actual bounded persisted outcome: plan
content or item identities, tool/action result, compaction summary, error, or
final result. Decision type plus `running`/`completed`, counts, paths, hashes,
or sizes alone are not faithful output when meaningful result fields exist.

If policy prevents retaining any useful semantic outcome, store safe metadata
but report the trace as incomplete for behavior evaluation. Do not call a
non-empty status object sufficient.

## Restart-safe implementation gates

1. Await and fully exit an observed start/resume request before launching
   fire-and-forget background work. Launch the loop only after leaving that
   dynamic trace scope.
2. Confirm every iteration is a fresh parentless trace. `fork: true` alone is
   not proof of async-context detachment.
3. After each iteration root ends on success or failure, perform an awaited,
   bounded flush from the outer loop's `finally` path. Production may continue
   from durable state when telemetry fails, but the experiment must mark that
   checkpoint's tracing verification blocked.
4. Prefer a random boot-time UUID as the tracer resource attribute
   `service.instance.id`. If the installed SDK cannot set that resource, attach
   the UUID to every iteration root and report the limitation. Do not use only
   hostname plus PID; both may repeat after a container restart.
5. Require an explicit project and propagate complete routing into every loop
   process.
6. Disable or avoid automatic provider capture that retains history, system
   prompts, schemas, files, or secrets in any metadata field.

## Completion gate

Run a real multi-iteration agent through tools, compaction, a hard process
restart, resume, and finish. Reconcile the durable iteration ledger with stored
Judgment evidence and prove:

- exactly one finalized root for every completed iteration;
- root input/output semantically matches the persisted decision outcome;
- LLM/tool children fit within the correct iteration root;
- every root uses the exact run session ID;
- iteration numbers are contiguous across restart and compactions are visible;
- the boot UUID changes across restart while the run ID remains stable;
- raw payloads exclude secrets, history, schemas, files, and static prompts;
  and
- the final pre-kill iteration was exported before the process died.

Separate static, synthetic, real-application, and stored-platform evidence in
the final report with `pass`, `fail`, or `blocked` for each gate. Do not call a
fake model run or missing raw-span inspection live/end-to-end evidence.
