# Persistent CLI Wrapper Binding Recipe

Read this file completely before editing a service that invokes an agent CLI
and persists the CLI's returned session ID for later resume.

## Contents

- [Declare the target before editing](#1-declare-the-target-before-editing)
- [Bind one wrapper root](#2-bind-one-wrapper-root)
- [Use one fail-open outcome adapter](#3-use-one-fail-open-outcome-adapter)
- [Configure routing and payload policy](#4-configure-routing-and-payload-policy)
- [Bind inner evidence only when real](#5-bind-inner-evidence-only-when-real)
- [Prove the stored result](#6-prove-the-stored-result)

## 1. Declare the target before editing

Inspect the accepted-request boundary, CLI runner, response parser, mapping
store, resume path, restart launcher, and failure behavior. Declare exactly one
observability target:

- `wrapper baseline`: faithful wrapper root, aggregate CLI child, exact CLI
  session continuity, and restart-safe export; or
- `linked inner-agent traces` / `full nested inner coverage`: only when a real
  documented hook, stream JSON, OTel, or native source supplies trustworthy
  LLM/tool/subagent records.

Stock `claude -p --output-format json` supplies a result and session metadata,
not trustworthy inner timing. Never synthesize inner spans or call the
aggregate CLI child full agent tracing. If stronger coverage is targeted but
the real source is unavailable, pass the wrapper baseline and mark stronger
coverage `blocked`.

## 2. Bind one wrapper root

- One accepted wrapper task is one root. Begin when the parsed request enters
  business/session validation; keep transport auth/shape validation outside so
  rejected payloads are not copied. If rejected-request telemetry is required,
  keep it metadata-only.
- Keep the root active through session validation, CLI execution, returned-ID
  parsing, mapping and turn persistence, response construction, and the final
  reply/error. Do not end when the subprocess merely starts or returns.
- Decide expected upstream parentage before editing. Without deliberate W3C or
  distributed context, the business root must be parentless; otherwise record
  the expected upstream trace/span chain and keep complete local lifetime/IO.
- Root input is the bounded safe accepted prompt. Root output is the bounded
  final reply plus small truthful status metadata.
- For an invalid wrapper session, keep input metadata-only with safe IDs and a
  normalized error output; do not capture the free-form prompt.
- Preserve two identities: wrapper ID as an attribute, underlying CLI session
  ID as `judgment.session_id`.
- On the first turn, set the returned CLI ID on the same still-active root after
  parsing. On resume, attach the persisted ID before invocation and prove it is
  exactly the ID passed to the CLI. Do not invent a CLI session on first-turn
  failure.
- Add one `agent_cli.invoke` child with provider/version when available, mode,
  resume flag, safe workspace identity, timeout, duration, exit code, returned
  CLI session ID, and bounded result or normalized error.
- Exclude or separately sample health, session-read, and ASGI transport noise.

## 3. Use one fail-open outcome adapter

Disable automatic root/CLI IO capture and use one business path for success and
failure:

1. Guard trace setters, sanitizers/classifiers, reporters, finalization, and
   flush reporting. Telemetry failure must not alter application behavior.
2. Run existing session validation, CLI invocation, parsing, persistence, and
   response construction once.
3. Record success only after mapping/persistence and the actual reply succeed.
4. For invalid session, nonzero exit, timeout, launch failure, parse failure,
   persistence failure, or response failure, record the same stable semantic
   error category and OpenTelemetry `StatusCode.ERROR` on the root and every
   applicable CLI child. Set status while each span is current; a custom
   `error` attribute alone still leaves the span looking successful.
5. Keep original exceptions only in memory; never trace raw stderr, command,
   environment, exception text, or JSONL. End the observed root, then rethrow or
   preserve the existing handler behavior outside it.
6. After root end, await a bounded flush in the outer route's `finally` before
   returning/rethrowing at the tested restart checkpoint. Failed export blocks
   the tracing claim but cannot replace a valid reply or original exception.

Do not create a separate copyable traced error path. Do not turn nonzero exit
into traced success because an exit-code field exists. Tracing outcome and
transport outcome are separate: if the existing application persists a
nonzero result and returns HTTP 200, preserve that behavior while marking the
CLI child and wrapper root as errors with the same safe code. Do not throw,
retry, skip persistence, or change the response merely to make tracing easier.

Use this small helper inside each active span; guard it with the same
best-effort telemetry wrapper as every other trace-only write:

```python
from opentelemetry.trace import Status, StatusCode

def mark_current_span_error(code: str, output: dict) -> None:
    # `code` must come from a fixed allowlist, never exception or stderr text.
    Tracer.set_output({**output, "ok": False, "error_code": code})
    Tracer.get_current_span().set_status(Status(StatusCode.ERROR, code))
```

Call it once while `agent_cli.invoke` is current for CLI-owned failures, then
again while the wrapper root is current. For validation, mapping, persistence,
or response failures that occur outside CLI invocation, mark only the wrapper
root. Return an in-memory outcome from an observed scope and rethrow the
original exception only after that scope ends when automatic exception capture
cannot be safely disabled.

## 4. Configure routing and payload policy

- Require an explicit project before serving; never guess a project or install
  a silent no-op tracer.
- Forward key, organization, project, and endpoint overrides into the actual
  wrapper process and, only when inner coverage is claimed, into that subprocess.
- Inject real CLI seat/OAuth credentials only through the supported runtime
  mechanism. Never write them to `.env`, docs/examples, trace fields, logs, or
  committed files; verify only presence/length and login state, never the value.
- Run the real launcher with project explicitly set to empty under a 30-second
  bound and guaranteed cleanup. It must exit nonzero with the expected error
  before readiness even when dotenv exists. `unset` is not proof.

Choose an approved sanitizer, a conservative credential/auth baseline that
requires privacy review, or strict omission that blocks prompt/reply usefulness.
Sanitize before bounding, leave storage-clipping margin, and prove settled
`judgment.input`/`judgment.output` still parse as the intended structure.
Exercise a benign semantic marker plus non-real OpenAI-style `sk-`, GitHub-style
`ghp_` and `github_pat_`, other installed-provider/API-key, authorization,
cookie/session, secret-assignment, URL-credential, and private-key canaries
before/beyond the bound and in reply/error paths. Search settled raw roots,
CLI/inner children, events, and resource attributes before and after restart.
The marker survives; all canaries, raw commands/stderr/environments, unapproved
files, histories, schemas, and transcripts are absent.

## 5. Bind inner evidence only when real

For linked or nested inner coverage:

- name the actual hook/JSONL/OTel/native source;
- reconcile its records to the same wrapper turn or explicit links;
- normalize clocks so no child precedes the root;
- keep the root open or update it last so all intended records and final IO are
  present before online evaluation;
- preserve real model/token/cost and business tool identity;
- deduplicate identical hook/JSONL events; and
- represent independently useful subagents as linked traces when supported.

Absent real inner records are `blocked` for stronger coverage, never
`not-applicable`, while the honest wrapper baseline may still pass.

## 6. Prove the stored result

Run two independent real wrapper sessions. Record wrapper IDs and returned CLI
IDs, boundedly flush, restart the wrapper, then resume both using persisted CLI
IDs. Exercise a tool-producing task when practical and safely exercise nonzero,
timeout, and launch failure; an untriggered existing error path is `blocked`.
Also run the wrapper's supported fake/degraded mode as a separate regression:
its roots must be valid and explicitly labeled fake, retain stable fake session
IDs across restart, and make no claim of real inner-agent coverage.

Reconcile recorded requests/results with settled raw Judgment data and require:

- exactly one finalized nonzero-duration business root per real task, with
  truthful prompt/reply or normalized error and no read/health roots;
- exact returned/resumed CLI session IDs group the right turns across restart
  while independent sessions remain separate;
- raw start/end arithmetic proves CLI/inner children show honest mode, timing,
  resume, exit, and outcome completely inside the root window;
- raw trace/span/parent IDs prove CLI/inner parentage; require an empty business
  root parent only when no deliberate upstream distributed context exists;
- project/endpoint routing and the explicit-empty negative test pass;
- payload canaries, semantic usefulness, and structured IO parseability pass
  in raw attributes;
- last pre-restart and first post-restart roots survive bounded post-root flush;
  and
- every claimed inner LLM/tool/subagent has actual raw trace/span/link evidence.

Fake mode, successful HTTP, builds, or scratch spans are synthetic only. Use
`not-applicable` only when the architecture truly lacks a gate; missing auth,
traffic, raw evidence, or export is `blocked`.
