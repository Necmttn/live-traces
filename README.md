# live-traces

> Real-time Effect span streaming to frontend UIs.

Wrap a workflow in `withTrace`, mount the React hooks, and the user sees every span - start, end, log event - as it happens. Built on top of [Effect](https://effect.website)'s `Tracer`, composes with OpenTelemetry, wire format is plain JSON so any backend can emit.

**Package docs & API reference** → [`packages/live-traces/README.md`](./packages/live-traces/README.md)
**Landing page & live demo** → [live-traces.necmttn.com](https://live-traces.necmttn.com)

## Repo layout

```
live-traces/
├── packages/
│   └── live-traces/         # The npm package
├── examples/
│   └── demo-effect/         # Runnable demo - Effect backend + SSE + React frontend
├── apps/
│   └── site/                # Landing page (live-traces.necmttn.com)
└── .github/workflows/       # CI + release-please publish pipeline
```

## Develop

```bash
bun install
bun --filter live-traces test
bun --filter live-traces build
bun demo         # runs the example backend + frontend
bun site         # runs the landing site locally
```

## Release flow

Pushes to `main` with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `feat!:` …) trigger [release-please](https://github.com/googleapis/release-please) to open a release PR. Merging the release PR tags `live-traces-vX.Y.Z`, which triggers npm publish (provenance enabled).

### One-time setup

GitHub repo secrets:
- `NPM_TOKEN` - automation token from npmjs.com (write access to the `live-traces` package)
- `CF_API_TOKEN` - Cloudflare API token (for landing site deploy, scope: `apps/site/wrangler.toml`)

## License

[Apache-2.0](./LICENSE) © Necmettin Karakaya
