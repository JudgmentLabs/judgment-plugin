# Durable Workflow Binding Recipe

Read this file completely before editing a Temporal or other durable-workflow
agent. This checklist is binding; adapt names and SDK calls to the repository.

## Contents

- [Map the durable work](#1-map-the-durable-work)
- [Choose one honest trace model](#2-choose-one-honest-trace-model)
- [Bind the implementation](#3-bind-the-implementation)
- [Preserve application behavior](#4-preserve-application-behavior)
- [Apply one payload policy](#5-apply-one-payload-policy)
- [Prove the stored result](#6-prove-the-stored-result)

## 1. Map the durable work

Write down before editing:

1. the exact persisted workflow/job ID;
2. short producer writes such as submit, approve, cancel, or retry;
3. every suspend/checkpoint: approval, timer, queue handoff, or worker boundary;
4. the business work and possible retries on each side of those boundaries;
5. the process that can own, end, and export each proposed root; and
6. status/health/read routes that must be excluded or sampled separately.

Never make a short HTTP request own work that continues after its response.
Never hold a span open across an indefinite durable wait.

## 2. Choose one honest trace model

- Canonical model: one fresh trace for each application-owned work segment
  between durable suspends, plus separate short producer-write traces.
- Use the exact workflow/job ID as `judgment.session_id` on every related root.
- Use a segment only when one component owns its whole lifetime and can end and
  export it with final semantic input/output.
- Otherwise use one fresh trace per meaningful activity or restart-safe
  execution phase. Report this as the safe fallback, not the canonical segment
  model. Do not fake a cross-process parent.
- Name roots by business purpose. Do not let `StartWorkflow`, `RunActivity`,
  transport, polling, or interceptor shells dominate the session.

Each root must have positive duration, final IO, and a window containing all
children. Sharing a trace ID is not proof. A session groups completed traces;
it does not repair a malformed trace.

## 3. Bind the implementation

- Initialize one Judgment runtime in each actual producer/exporting worker
  before it accepts work. Keep deterministic workflow/replay code free of
  network export, random IDs, wall-clock reads, and span lifecycle calls.
- Require an explicit project and forward key, organization, project, and
  endpoint overrides into every real launcher. With the project explicitly set
  to an empty value, each producer/worker launcher must exit nonzero before
  readiness within a bounded test, even when dotenv exists. `unset` is not the
  test. Always clean up the process/container.
- Start a fresh application root at the segment/activity boundary. Confirm the
  installed SDK's fresh/fork behavior; default observation under an active
  interceptor is not detachment proof. Set the workflow session only after the
  intended root is active.
- Disable automatic root/provider/tool capture unless every captured field is
  approved, bounded, and useful. Do not copy workflow state, history, prompts,
  schemas, HTML, files, reports, credentials, or raw exceptions.
- Root input must contain a bounded semantic trigger. Root output must retain
  the smallest safe business result that distinguishes correct from wrong:
  plan items, step outcome, approval result, synthesis summary, and artifact
  identity as applicable. Counts, hashes, paths, and `completed` are supporting
  metadata, not substitutes for a richer result.
- Keep real LLM/tool work inside the owning root with business names and useful
  bounded IO/error plus honest provider/model/token/cost when available. Do not
  duplicate framework spans with manual spans.
- Record retry attempt and normalized outcome. Preserve failed and successful
  attempts without replay duplicates or double instrumentation.

## 4. Preserve application behavior

Use one outcome boundary, not separate success and error implementations:

1. Disable automatic input/output capture on the observed business function.
2. Guard trace setters, sanitizer/classifier calls, root finalization,
   reporters, and flush reporting. Telemetry failures remain observable but
   cannot change durable work.
3. On application failure, record a stable semantic code/status inside the
   root and keep the original exception only in memory.
4. End the observed root, then rethrow the original from the outer activity or
   preserve the repository's existing recovery/retry behavior exactly.
5. From that outer owner's `finally`, await a bounded flush after root end on
   success and failure before acknowledging the activity. Flush failure blocks
   tracing verification; it must not replace the result or original exception.

Do not invent a durable `failed` state, suppress a retry, repeat a side effect,
or alter approval/resume behavior for tracing.

## 5. Apply one payload policy

Choose and name exactly one mode:

- approved application sanitizer, then bound;
- conservative credential/auth baseline, then bound, with privacy review still
  required; or
- strict omission, which blocks semantic behavior evaluation.

Sanitize the final composed value before bounding. Leave margin below the
platform's attribute limit for object serialization and prove settled
`judgment.input`/`judgment.output` still parse as the intended structure. In
controlled traffic, place a benign semantic marker plus non-real OpenAI-style
`sk-`, GitHub-style `ghp_` and `github_pat_`, other installed-provider/API-key,
authorization, cookie/session, secret-assignment, URL-credential, and
private-key canaries in input, result/error, and beyond-bound positions. Search
every settled raw root, child, event, and resource attribute. The benign marker
must survive; all canaries and unapproved history/schema/file bodies must be
absent.

## 6. Prove the stored result

Run the real production-style path through submit, pre-suspend work, the actual
approval/timer/signal, post-suspend completion, worker restart, and a retry when
that architecture supports one. Record the traffic events and exact workflow
ID, wait for ingestion to settle, then reconcile raw Judgment data.

Require:

- the intended project contains every producer and durable-work root;
- every meaningful root has exact workflow session ID, semantic final IO,
  positive duration, and all children inside its window;
- submit/approval roots are distinct from fresh durable-work roots;
- raw trace/span/parent IDs prove fresh roots are not inherited request or
  interceptor children and every intended child resolves inside its owner;
- pre/post-suspend and pre/post-restart work remain in one workflow session;
- attempts match recorded application retries without duplicates;
- LLM/tool evidence is useful and polling/transport noise does not dominate;
- payload canaries pass in settled raw attributes and structured root IO
  remains parseable; and
- the last completed pre-kill root is present after its bounded post-root flush.

Use `not-applicable` only when the architecture truly lacks the branch.
Unavailable traffic, credentials, hooks, raw spans, or failed export is
`blocked`, not a pass. Use the optional deep reference's completion table only
when producing the final evidence report.
