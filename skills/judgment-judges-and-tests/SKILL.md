---
name: judgment-judges-and-tests
description: Use when creating or aligning judges, using labels as indexes, building datasets, or running test suites before you ship.
---

# Judges, labels, and test suites

- A label is an index on traces. Ask one question per judge, write the rubric, and define at least two named choices.
- Save traces you want to revisit on a dataset. A test suite holds its own cases.
- Use a test suite to gate a change before you ship.
- Turn on **Online monitoring**, then select **Publish to production**, when the judge should label live traffic.
- Keep credentials out of chat.

## Start here

- [Labels as indexes](https://docs.judgmentlabs.ai/documentation/agents/labels-as-indexes)
- [Create a judge](https://docs.judgmentlabs.ai/documentation/judges/create-a-judge)
- [Run on live traffic](https://docs.judgmentlabs.ai/documentation/judges/run-on-live-traffic)
- [Cookbook: Data analysis](https://docs.judgmentlabs.ai/documentation/agents/cookbook-data-analysis)
- [First test suite](https://docs.judgmentlabs.ai/documentation/tests/first-test-suite)
- [Run a test suite](https://docs.judgmentlabs.ai/documentation/tests/run-a-test-suite)
- [Build a dataset](https://docs.judgmentlabs.ai/documentation/tests/build-a-dataset)

For live data, use Judgment MCP tools. For procedures the server already ships, call `get_skill`.
