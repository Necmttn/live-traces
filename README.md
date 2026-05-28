# livetrace

> Real-time Effect span streaming to frontend UIs.

Wrap a workflow in `withTrace`, mount the React hooks, and the user sees every span - start, end, log event - as it happens. Built on top of [Effect](https://effect.website)'s `Tracer`, composes with OpenTelemetry, wire format is plain JSON so any backend can emit.

**Package docs & API reference** → [`packages/livetrace/README.md`](./packages/livetrace/README.md)
**Landing page & live demo** → [livetrace.necmttn.com](https://livetrace.necmttn.com)

## Repo layout

```
livetrace/
├── packages/
│   └── livetrace/                 # The npm package
├── examples/                       # One runnable demo per transport
│   ├── demo-sse/                  # Effect backend → SSE → React UI
│   ├── demo-ws/                   # Effect backend → WebSocket → React UI
│   └── demo-durable-streams/      # Effect backend → @durable-streams/server → React UI
├── apps/
│   └── site/                       # Landing page (livetrace.necmttn.com)
└── .github/workflows/              # CI + release-please publish pipeline
```

## Develop

```bash
bun install
bun --filter livetrace test
bun --filter livetrace build

# Demo per transport - each spins its own backend + Vite dev server
bun demo:sse     # SSE  (api :8787, web :5173)
bun demo:ws      # WS   (api :8788, web :5174)
bun demo:ds      # DurableStreams (ds :4437, api :8789, web :5175)

bun demo         # alias for demo:sse
bun site         # runs the landing site locally
```

## Release flow

Pushes to `main` with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `feat!:` …) trigger [release-please](https://github.com/googleapis/release-please) to open a release PR. Merging the release PR tags `livetrace-vX.Y.Z`, which triggers npm publish (provenance enabled).

### One-time setup

GitHub repo secrets:
- `NPM_TOKEN` - automation token from npmjs.com (write access to the `livetrace` package)
- `CF_API_TOKEN` - Cloudflare API token (for landing site deploy, scope: `apps/site/wrangler.toml`)

## License

[Apache-2.0](./LICENSE) © Necmettin Karakaya
