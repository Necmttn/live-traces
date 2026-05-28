# livetraces

> Real-time Effect span streaming to frontend UIs.

Wrap a workflow in `withTrace`, mount the React hooks, and the user sees every span - start, end, log event - as it happens. Built on top of [Effect](https://effect.website)'s `Tracer`, composes with OpenTelemetry, wire format is plain JSON so any backend can emit.

**Package docs & API reference** → [`packages/livetraces/README.md`](./packages/livetraces/README.md)
**Landing page & live demo** → [livetraces.necmttn.com](https://livetraces.necmttn.com)

## Repo layout

```
livetraces/
├── packages/
│   └── livetraces/         # The npm package
├── examples/
│   └── demo-effect/         # Runnable demo - Effect backend + SSE + React frontend
├── apps/
│   └── site/                # Landing page (livetraces.necmttn.com)
└── .github/workflows/       # CI + release-please publish pipeline
```

## Develop

```bash
bun install
bun --filter livetraces test
bun --filter livetraces build
bun demo         # runs the example backend + frontend
bun site         # runs the landing site locally
```

## Release flow

Pushes to `main` with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `feat!:` …) trigger [release-please](https://github.com/googleapis/release-please) to open a release PR. Merging the release PR tags `livetraces-vX.Y.Z`, which triggers npm publish (provenance enabled).

### One-time setup

GitHub repo secrets:
- `NPM_TOKEN` - automation token from npmjs.com (write access to the `livetraces` package)
- `CF_API_TOKEN` - Cloudflare API token (for landing site deploy, scope: `apps/site/wrangler.toml`)

## License

[Apache-2.0](./LICENSE) © Necmettin Karakaya
