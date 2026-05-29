# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html). This file is maintained by [release-please](https://github.com/googleapis/release-please).

## [0.1.1](https://github.com/Necmttn/livetrace/compare/livetrace-v0.1.0...livetrace-v0.1.1) (2026-05-29)


### Features

* **site:** lock hero layout + wire Transports section ([8fbd670](https://github.com/Necmttn/livetrace/commit/8fbd6708577ac1aa04ef03d8df8380bf250e0f17))
* **transports:** replace in-memory durable stub with @durable-streams/client transport ([5eb3bfc](https://github.com/Necmttn/livetrace/commit/5eb3bfc2ad318e21283b2982048f4f12cf1c1519))

## 0.1.0

Initial public release. Extracted from internal Quera codebase.

### Added

- `LiveTraceLayer` - Effect Tracer decorator that wraps any base tracer (native or OTel).
- `withTrace` / `step` - user-facing scope helpers.
- `TraceSink` + `TraceSinkLive` - buffered event sink with configurable flush.
- `ConsoleTransportLayer` - debugging transport.
- `SSETransportLayer` + in-process `SseBroker` - server-sent events transport with per-scope routing.
- `liveTraceLogger` - bridges `Effect.log` calls inside traced scopes to `SpanEvent`.
- `livetrace/react` - `TraceStore`, `useActiveTraces`, `useTrace`, `useTraceSteps`, `useSpanTree`.
- `livetrace/types` - dependency-free wire-format types for non-TS/non-Effect backends.
- Effect `Schema` definitions for runtime validation.
