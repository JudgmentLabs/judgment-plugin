# Checkpointed Long-Running Agent Loops

Use this guide when an agent repeatedly reasons, calls at most one or a few
tools, persists state, and continues until a final decision. It applies to
hand-rolled research loops, autonomous task agents, and other processes that
can be stopped and resumed from a checkpoint.

The key design question is not “How long does the whole run last?” It is “What
is the smallest unit that becomes durable and independently complete?” When
the agent saves state after every decision, that decision iteration is normally
the trace. The overall run is a Judgment session containing those traces.

## Required model

For a checkpointed loop:

- One completed durable iteration is one trace.
- Use a stable application-specific root name such as `hermes.iteration`, not
  the literal generic name `agent.iteration` and not one name per iteration
  number. Put iteration number and decision type in attributes/root IO.
- The root begins before the iteration's model decision and ends after its
  action/result/error and updated state are durably saved.
- `judgment.session_id` is the stable run ID on every iteration root.
- The root input is a bounded, sanitized goal and state summary.
- The root output identifies the decision type and the branch-specific bounded
  result or error that was persisted. Status is supporting metadata; status
  alone never describes a successful iteration that produced a result.
- The model call and the tool selected by that decision are children.
- Compaction, checkpoint, retry, and finish decisions remain visible as their
  own iteration traces rather than disappearing into an outer run wrapper.
- Short start/resume HTTP requests may be separate traces, but they never own
  background iterations that outlive the response.

Example:

```text
session_id = run_id

trace hermes.iteration (decision_type=plan)
  root input: goal + iteration + bounded state summary
  child: LLM decision
  root output: decision=plan + bounded plan items/summary + item count

trace hermes.iteration (decision_type=tool)
  root input: goal + iteration + bounded state summary
  child: LLM decision
  child: search tool
  root output: decision=tool + tool name + bounded action result/error

trace hermes.iteration (decision_type=compact)
  child: LLM decision
  root output: decision=compact + bounded compaction summary + before/after sizes

trace hermes.iteration (decision_type=finish)
  child: LLM decision
  child: final report write when applicable
  root output: decision=finish + bounded final-result summary + path/size
```

## Why a process-lifetime or whole-run root is fragile

A process segment is not automatically a meaningful work unit. If a container
is killed after 15 already-persisted iterations, one still-open segment root
can remain at zero duration with no final input/output or session update. The
platform may omit that trace from Sessions and never run finalization-triggered
evaluation, even though many useful child spans arrived.

Do not make a root that can only become valid when the entire process exits
cleanly. A long run root is a coherent alternative only when one owner can
actually keep it active, finalize it with faithful output, and preserve it
across every supported restart. For a checkpointed loop, that is usually a
worse fit than completed iteration roots.

Do not add both a run-segment root and iteration children merely to create a
deep hierarchy. Judgment sessions already provide the run-level grouping.
Duplicating that boundary increases the blast radius of a killed process and
can hide every completed iteration behind one unfinalized root.

## Locate the durable boundary before editing

Read the loop, store/checkpoint code, start/resume entrypoints, model adapter,
tool dispatcher, and shutdown behavior. Identify:

1. The stable run ID that survives restart.
2. The function that performs exactly one decision iteration.
3. The point at which that iteration's state and history are durably saved.
4. Compaction and finish branches.
5. The real model path and any fake/degraded test path.
6. The tool dispatch site and all business tool names.
7. The mechanism that restarts or resumes the loop.
8. Whether the runtime exposes a process/container instance ID.

Place the root around the one-iteration function. It must remain open through
the model call, selected tool, state mutation, and persistence. End it only
after the save succeeds or after a failure outcome is itself persisted.

The iteration must also be a fresh trace. A background promise launched from a
traced start/resume request can retain that request's async context after the
HTTP root ends. Do not launch the loop inside the observed start/resume
callback. The observed callback should create or load and persist the run,
return its accepted response, and fully exit. The outer HTTP handler should
await that callback and only then launch the background loop after the dynamic
trace scope has ended. With a Judgeval version that supports the documented
`fork: true` observe option, use it as an additional defense, not as proof that
context detached. Otherwise use the installed version's explicit fresh-root
mechanism. In every case, raw stored evidence must show each iteration as a
parentless root with a trace ID distinct from the start/resume request.

## TypeScript pattern

Match the installed Judgeval API rather than copying this blindly. With the
current function-wrapper API, the shape is:

```typescript
async step(run: RunState): Promise<RunState> {
  const outcome = await Tracer.observe(
    async () => {
      Tracer.setSessionId(run.id);
      Tracer.setInput({
        runId: run.id,
        iteration: run.iteration,
        goal: boundedText(run.goal),
        state: summarizeState(run),
      });

      try {
        const decision = await this.llm.decide(run);
        const result = decision.type === "tool"
          ? await executeTool(decision.tool, decision.args)
          : undefined;

        applyDecision(run, decision, result);
        await this.store.saveRun(run);

        Tracer.setOutput(summarizeIterationOutcome(decision, result, run));
        return { state: run, error: undefined };
      } catch (error) {
        const message = safeError(error);
        run.status = "failed";
        run.error = message;
        await this.store.saveRun(run);
        Tracer.setOutput({ status: "failed", error: message });
        // Record a normalized safe exception inside the span. Returning the
        // original exception only in memory prevents the decorator from
        // automatically copying its raw message into trace attributes.
        Tracer.setError(new Error("agent_iteration_failed"));
        return { state: run, error };
      }
    },
    {
      spanType: "agent",
      // Replace "hermes" with this application's stable name.
      spanName: "hermes.iteration",
      recordInput: false,
      recordOutput: false,
      // Judgeval 1.2.1 supports this. Confirm the installed version before use.
      fork: true,
    },
  )();

  // Preserve application behavior after the observed scope has ended.
  if (outcome.error !== undefined) throw outcome.error;
  return outcome.state;
}
```

`boundedText`, `summarizeState`, the `safe*` outcome helpers, and `safeError`
are placeholders for real redaction and size policies. Do not store full
notes, fetched pages, report bodies, conversation history, system prompts,
tool schemas, or credentials.

Implement `summarizeIterationOutcome` exhaustively for the application's real
decision union. It must retain the branch-specific persisted outcome, for
example:

```typescript
function summarizeIterationOutcome(
  decision: Decision,
  result: ToolResult | undefined,
  run: RunState,
) {
  switch (decision.type) {
    case "plan":
      return {
        decisionType: "plan",
        plan: safePlanItems(decision.items),
        planItemCount: decision.items.length,
      };
    case "tool":
      return {
        decisionType: "tool",
        toolName: decision.tool,
        outcome: result ? safeToolResult(result) : { status: "no-result" },
      };
    case "compact":
      return {
        decisionType: "compact",
        summary: safeCompactionSummary(decision.summary),
        beforeItems: decision.beforeItems,
        afterItems: decision.afterItems,
      };
    case "finish":
      return {
        decisionType: "finish",
        finalSummary: safeFinalSummary(decision.answer),
        reportPath: safeRelativePath(run.reportPath),
        reportBytes: run.reportBytes,
      };
    default:
      return assertNever(decision);
  }
}
```

Adapt field names to the repository rather than inventing state. A value such
as `{ decisionType, toolName, status }` is incomplete when the iteration saved
a plan, tool result, compaction summary, or final answer.

Inspect the installed SDK before using `fork`; do not assume every version has
the same option. If it is unavailable, use that version's documented
fresh/linked-trace primitive or explicit context detachment. Plain observation
with the default `fork: false` does not break an inherited HTTP parent chain.

Use a stable application-specific root name such as `hermes.iteration` and
record iteration number plus decision type as attributes. If the decision type
is known only after the LLM returns, set an attribute or update the root output;
do not create a second root or put the iteration number in the span name.

## Model and tool children

- Wrap or instrument the real model SDK call so provider, model, tokens, cost,
  latency, and output/error are present.
- Fake model mode is useful for local validation, but label it clearly and do
  not claim real LLM metadata from it.
- Use business tool names such as `search`, `fetch_page`, or `write_report`.
- Record bounded semantic input/output-or-error: query length or safe query,
  URL host/path when safe, byte counts, result counts, status, and output path.
- Disable automatic capture when it would store full pages, notes, reports,
  files, or large accumulated state.
- Inspect every raw provider attribute, including invocation parameters and
  system-prompt fields. Hiding generic input/output is insufficient if another
  attribute still stores the full static prompt. If the installed integration
  cannot suppress that field, use a manual LLM span with automatic IO disabled
  or report privacy-safe LLM coverage as blocked.
- Avoid a generic tool wrapper plus a second business tool span for the same
  action.

## Sessions and restart evidence

The session ID is the durable run ID, not the process ID and not the start
request ID. Verify from stored roots that:

- every pre-restart iteration trace has the exact run ID;
- the first post-resume iteration uses the same run ID;
- unrelated runs remain separate;
- all completed pre-restart iterations are visible in the Sessions view; and
- no zero-duration segment root is required for session continuity.

Set a process/container instance attribute that changes after restart while
the session ID stays the same. Prefer generating a random boot UUID once at
module/bootstrap initialization and installing it as the tracer resource
attribute `service.instance.id`. If the installed Judgeval API cannot set that
resource, attach the UUID to every root (for example
`agent.process_boot_id = processBootId`) and report that fallback. Do not use
hostname plus PID alone in a container; both can be reused after restart and
falsely imply that one process survived. Never invent a new run/session ID
merely to mark the restart.

## Export lifecycle

Each completed iteration should be independently exportable. After the root
has ended, use a bounded, observable flush at a lifecycle point appropriate to
the runtime when an immediate kill can otherwise discard the just-completed
iteration. A flush while the root is still open cannot export its final root
state.

Place the flush in the loop caller, after the observed `step` promise resolves:

```typescript
async function boundedForceFlush(timeoutMs = 5_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Tracer.forceFlush(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Judgment iteration flush timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function stepAndFlush(
  run: RunState,
  step: (run: RunState) => Promise<RunState>,
): Promise<RunState> {
  let next: RunState | undefined;
  let checkpointTraceSafe = false;
  try {
    next = await step(run); // observed root ends on return or throw
    return next;
  } finally {
    try {
      await boundedForceFlush();
      checkpointTraceSafe = true;
    } catch (error) {
      // Keep telemetry failure observable without corrupting saved agent state.
      console.error("Judgment iteration flush failed", error);
    }

    if (!checkpointTraceSafe) {
      reportTraceExportFailure(run.id, next?.iteration ?? run.iteration);
    }
  }
}
```

Current Judgeval TypeScript versions expose `forceFlush()` as a promise without
a timeout parameter, which is why the bound is implemented by the caller.
Inspect the installed version before copying the exact call.

Do not swallow a failed flush and then call the checkpoint trace-safe. The
application's state can remain durable without making telemetry a dependency,
but the tracing verification is blocked until export succeeds or the missing
iteration is observed after the normal exporter delay. The outer `finally`
must run after both successful and failed iteration attempts.

Do not rely only on graceful process shutdown. The adversarial case is a kill
immediately after a persisted checkpoint. The last fully completed
pre-restart iteration and the first post-restart iteration must both appear as
finalized roots.

## Entrypoint traces

Start and resume routes can provide useful operational context:

- start: bounded goal/config input; run ID and accepted status output;
- resume: run ID/reason input; resumed/accepted status output.

Keep them separate from background loop work. Do not propagate an HTTP root as
the parent of future iterations after the response has returned. Exclude
health and high-frequency status polling unless separately sampled for an
operational purpose.

## Mandatory real-path verification

Use the real application runtime and its real model mode for the scored check:

1. Start one long run and record its exact run ID.
2. Let multiple iterations and at least one tool complete.
3. Kill the process immediately after a durable checkpoint.
4. Restart and resume the same run.
5. Require compaction/checkpoint and finish branches when the scenario exposes
   them.
6. Wait for ingestion to settle and query the exact session ID.
7. Compare the iteration ledger with the stored roots.

The result passes only when:

- expected completed iterations have one finalized root each;
- each root's time window contains its model/tool children;
- root input/output truthfully describes that iteration;
- all roots carry the exact run session ID;
- pre- and post-restart iterations coexist in that session;
- compaction and finish are independently inspectable;
- every executed business tool is present once with bounded useful IO;
- real model spans contain model/token/cost metadata;
- the final report/action is visible; and
- no large state or credentials appear in raw attributes.

A fake-mode, no-restart smoke trace cannot satisfy this gate. It proves basic
SDK wiring only.

## Completion gate

| Gate | Required evidence |
| --- | --- |
| Durable unit | The code path that saves one decision iteration is named and used as the root boundary |
| Fresh roots | Every iteration is a parentless root with a trace ID distinct from the start/resume request; the installed fresh-trace mechanism is confirmed rather than assumed |
| Trace count | Completed iteration ledger reconciles with finalized iteration roots |
| Root evidence | Each root has bounded faithful input/output and contains all children |
| Session continuity | Exact durable run ID is on every root before and after restart |
| Restart survival | Last completed pre-kill and first post-resume iterations both arrive |
| Process evidence | A process/container instance attribute changes across restart while the durable session ID remains stable, unless the runtime provides an equivalent independently verified marker |
| Decision coverage | Plan/tool/compaction/retry/finish outcomes are visible |
| LLM coverage | Real model spans include provider/model/tokens/cost |
| Tool coverage | Every executed business tool has one useful bounded child span |
| Entrypoints | Start/resume writes are separate traces or explicitly justified as omitted |
| Payload safety | Raw attributes exclude full accumulated state, pages, files, reports, schemas, and secrets |
| Export lifecycle | A bounded flush after root finalization succeeds before a deliberate restart is called trace-safe, or export failure blocks that verification claim |
| Real-path proof | Stored evidence comes from the real model plus forced restart scenario, not only a fake smoke |
