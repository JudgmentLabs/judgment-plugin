#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';


function emitAndExit(document, code) {
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  process.exit(code);
}


function resolvePackageJson(appRoot) {
  const direct = path.join(appRoot, 'node_modules', 'ai', 'package.json');
  if (fs.existsSync(direct)) return direct;

  try {
    const requireFromApp = createRequire(path.join(appRoot, 'package.json'));
    return requireFromApp.resolve('ai/package.json');
  } catch {
    return null;
  }
}


function sourceEntries(sourceMap) {
  if (!Array.isArray(sourceMap.sources) || !Array.isArray(sourceMap.sourcesContent)) {
    return [];
  }
  return sourceMap.sources.map((name, index) => ({
    name,
    content: sourceMap.sourcesContent[index] ?? '',
  }));
}


const appRoot = path.resolve(process.argv[2] ?? process.cwd());
const packageJsonPath = resolvePackageJson(appRoot);
if (!packageJsonPath) {
  emitAndExit({
    ok: false,
    app_root: appRoot,
    reason: 'installed_ai_package_not_found',
  }, 2);
}

let packageDocument;
try {
  packageDocument = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch (error) {
  emitAndExit({
    ok: false,
    app_root: appRoot,
    package_json: packageJsonPath,
    reason: 'installed_ai_package_json_unreadable',
    error_type: error?.constructor?.name ?? 'Error',
  }, 2);
}

const version = String(packageDocument.version ?? '');
const major = Number.parseInt(version.split('.')[0], 10);
if (![5, 6].includes(major)) {
  emitAndExit({
    ok: false,
    app_root: appRoot,
    package_json: packageJsonPath,
    installed_version: version,
    reason: 'unsupported_ai_sdk_major',
    supported_majors: [5, 6],
  }, 2);
}

const packageRoot = path.dirname(packageJsonPath);
const mapCandidates = [
  path.join(packageRoot, 'dist', 'index.mjs.map'),
  path.join(packageRoot, 'dist', 'index.js.map'),
];
const sourceMapPath = mapCandidates.find((candidate) => fs.existsSync(candidate));
if (!sourceMapPath) {
  emitAndExit({
    ok: false,
    app_root: appRoot,
    package_json: packageJsonPath,
    installed_version: version,
    reason: 'ai_sdk_source_map_not_found',
  }, 3);
}

let entries;
try {
  entries = sourceEntries(JSON.parse(fs.readFileSync(sourceMapPath, 'utf8')));
} catch (error) {
  emitAndExit({
    ok: false,
    app_root: appRoot,
    package_json: packageJsonPath,
    installed_version: version,
    source_map: sourceMapPath,
    reason: 'ai_sdk_source_map_unreadable',
    error_type: error?.constructor?.name ?? 'Error',
  }, 3);
}

const streamEntry = entries.find(({ name, content }) =>
  /(?:^|\/)generate-text\/stream-text\.ts$/.test(name)
  || (content.includes('ai.streamText') && content.includes('rootSpan.end()')),
);
const recordSpanEntry = entries.find(({ name, content }) =>
  /(?:^|\/)telemetry\/record-span\.ts$/.test(name)
  || (content.includes('startActiveSpan') && content.includes('endWhenDone')),
);
const toolEntry = entries.find(({ content }) =>
  /name:\s*['"]ai\.toolCall['"]/.test(content)
  && content.includes('executeTool'),
);
const notifyEntry = entries.find(({ name, content }) =>
  /(?:^|\/)util\/notify\.ts$/.test(name)
  && content.includes('export async function notify'),
);

if (!streamEntry || !recordSpanEntry || !toolEntry) {
  emitAndExit({
    ok: false,
    app_root: appRoot,
    package_json: packageJsonPath,
    installed_version: version,
    source_map: sourceMapPath,
    reason: 'ai_sdk_lifecycle_sources_unrecognized',
    found: {
      stream_text: Boolean(streamEntry),
      record_span: Boolean(recordSpanEntry),
      tool_execution: Boolean(toolEntry),
    },
  }, 4);
}

const streamSource = streamEntry.content;
const recordSpanSource = recordSpanEntry.content;
const toolSource = toolEntry.content;
const outerEndIndex = streamSource.indexOf('rootSpan.end()');
const sourceBeforeOuterEnd = outerEndIndex >= 0
  ? streamSource.slice(0, outerEndIndex)
  : '';
const directOnFinishBeforeOuterEnd = /await\s+onFinish\??\.\s*\(/.test(
  sourceBeforeOuterEnd,
);
const notifiedOnFinishBeforeOuterEnd = /await\s+notify\s*\(\s*\{[\s\S]{0,4000}?callbacks:\s*\[[\s\S]{0,750}?\bonFinish\b/.test(
  sourceBeforeOuterEnd,
);
const notifyAwaitsCallbacks = Boolean(notifyEntry)
  && /for\s*\([^)]*callback[^)]*callbacks[^)]*\)[\s\S]{0,500}?await\s+callback\s*\(/.test(
    notifyEntry.content,
  );
const onFinishBeforeOuterEnd = outerEndIndex >= 0
  && (directOnFinishBeforeOuterEnd
    || (notifiedOnFinishBeforeOuterEnd && notifyAwaitsCallbacks));
const onErrorBeforeOuterEnd = outerEndIndex >= 0
  && /await\s+onError\s*\(\s*\{\s*error\b/.test(sourceBeforeOuterEnd);
const onAbortInvoked = /\bonAbort\??\.\s*\(\s*\{/.test(streamSource);
const onAbortAwaited = /await\s+onAbort\??\.\s*\(/.test(streamSource)
  || /await\s+notify\s*\(\s*\{[\s\S]{0,4000}?callbacks:\s*\[[\s\S]{0,750}?\bonAbort\b/.test(
    streamSource,
  );
const onAbortInvokedWithoutAwait = onAbortInvoked && !onAbortAwaited;
const consumeStreamUsesFullStream = /await\s+consumeStream\s*\(\s*\{[\s\S]{0,500}?stream:\s*this\.fullStream/.test(
  streamSource,
);
const recordSpanActivatesCallbacks = /tracer\.startActiveSpan\([\s\S]{0,1200}?await\s+(?:context\.with\([\s\S]{0,300}?)?fn\(span\)/.test(
  recordSpanSource,
);
const toolCallbackReceivesSpan = /name:\s*['"]ai\.toolCall['"][\s\S]{0,1500}?fn:\s*async\s*(?:\(\s*span\s*\)|span)\s*=>/.test(
  toolSource,
);
const toolIoControlledByCapture = toolSource.includes('ai.toolCall.args')
  && toolSource.includes('ai.toolCall.result')
  && toolSource.includes('selectTelemetryAttributes');

const proven = onFinishBeforeOuterEnd
  && onErrorBeforeOuterEnd
  && onAbortInvokedWithoutAwait
  && consumeStreamUsesFullStream
  && recordSpanActivatesCallbacks
  && toolCallbackReceivesSpan
  && toolIoControlledByCapture;

emitAndExit({
  ok: proven,
  contract_schema_version: 1,
  app_root: appRoot,
  package_json: packageJsonPath,
  installed_version: version,
  installed_major: major,
  source_map: sourceMapPath,
  source_files: {
    stream_text: streamEntry.name,
    record_span: recordSpanEntry.name,
    tool_execution: toolEntry.name,
    notify: notifyEntry?.name ?? null,
  },
  lifecycle: {
    on_finish_awaited_before_outer_span_end: onFinishBeforeOuterEnd,
    on_finish_uses_awaited_notify_helper:
      notifiedOnFinishBeforeOuterEnd && notifyAwaitsCallbacks,
    on_error_awaited_before_outer_span_end: onErrorBeforeOuterEnd,
    on_abort_awaited: onAbortAwaited,
    on_abort_invoked_without_await: onAbortInvokedWithoutAwait,
    consume_stream_resolves_after_reading_full_stream: consumeStreamUsesFullStream,
    record_span_activates_callback: recordSpanActivatesCallbacks,
    tool_execute_receives_active_framework_span: toolCallbackReceivesSpan,
    tool_io_is_controlled_by_telemetry_capture: toolIoControlledByCapture,
  },
  binding_consequences: {
    framework_callbacks_are_outcome_only_binding:
      onFinishBeforeOuterEnd && onErrorBeforeOuterEnd && onAbortInvokedWithoutAwait,
    finish_or_error_root_end_or_final_flush_is_early:
      onFinishBeforeOuterEnd && onErrorBeforeOuterEnd,
    on_abort_cannot_own_awaited_finalization: onAbortInvokedWithoutAwait,
    existing_consumer_promise_is_candidate_settlement_evidence: consumeStreamUsesFullStream,
    disabled_bulk_capture_requires_manual_safe_tool_io: toolIoControlledByCapture,
  },
  reason: proven ? 'installed_ai_sdk_contract_proven' : 'installed_ai_sdk_contract_incomplete',
}, proven ? 0 : 4);
