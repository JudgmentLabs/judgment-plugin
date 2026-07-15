# Generic Streaming Verification Table

Read this optional file only after implementing the generic finite-stream
binding contract and running real traffic. Missing evidence is `blocked`; use
`not-applicable` only when the architecture genuinely lacks a gate.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Finite completion owner | <result> | static | Framework/version plus named terminal application event and owner |
| Existing stream topology | <result> | static | Existing consumers/tees/backpressure and proof tracing added none |
| Explicit routing negative | <result> | real application | Exact empty-project launcher command, nonzero exit, and expected error |
| Real terminal behavior | <result> | real application | Recorded success, error, persistence-failure, cancellation, and freeze/restart outcomes |
| Root parentage | <result> | stored Judgment | Raw trace-span-parent IDs plus expected upstream chain or empty-parent proof |
| Stored boundary/session/children | <result> | stored Judgment | Project, session/customer, root/child IDs, terminal IO, and window arithmetic |
| Error and cancellation | <result> | stored Judgment | Raw terminal outcomes matching application results without post-cancel work |
| Payload safety and usefulness | <result> | stored Judgment | Named mode, mandatory canaries, bounds, parseable structured IO, and inspected raw attributes |
| Export lifecycle | <result> | stored Judgment | Completed root surviving the tested EOF/freeze/restart barrier |
