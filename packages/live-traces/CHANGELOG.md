# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html). This file is maintained by [release-please](https://github.com/googleapis/release-please).

## 0.1.0

Initial public release. Extracted from internal Quera codebase.

### Added

- `LiveTraceLayer` - Effect Tracer decorator that wraps any base tracer (native or OTel).
- `withTrace` / `step` - user-facing scope helpers.
- `TraceSink` + `TraceSinkLive` - buffered event sink with configurable flush.
- `ConsoleTransportLayer` - debugging transport.
- `SSETransportLayer` + in-process `SseBroker` - server-sent events transport with per-scope routing.
- `liveTraceLogger` - bridges `Effect.log` calls inside traced scopes to `SpanEvent`.
- `live-traces/react` - `TraceStore`, `useActiveTraces`, `useTrace`, `useTraceSteps`, `useSpanTree`.
- `live-traces/types` - dependency-free wire-format types for non-TS/non-Effect backends.
- Effect `Schema` definitions for runtime validation.
