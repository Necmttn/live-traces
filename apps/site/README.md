# apps/site

Marketing page + interactive in-browser demo. Static Vite build, deployed to a Cloudflare Worker that serves the assets at **livetrace.necmttn.com**.

```bash
bun --filter site dev      # http://localhost:4173
bun --filter site build    # → dist/
bun --filter site deploy   # vite build && wrangler deploy
```

### One-time Cloudflare setup

1. **Authenticate:** `bunx wrangler login` (interactive) or set `CLOUDFLARE_API_TOKEN`.
2. **Run `wrangler deploy` once** to create the Worker named `livetrace-site`.
3. **Add a Custom Domain** in the Cloudflare dashboard:
   - Workers & Pages → `livetrace-site` → Settings → Triggers → **Add Custom Domain**
   - Use `livetrace.necmttn.com`. Cloudflare will provision the DNS + TLS automatically.
4. Once the custom domain is live, you can uncomment the `routes` block in `wrangler.toml` to keep it declarative.

### What's in the demo

The in-page demo (`src/components/Demo.tsx`) generates `TraceEvent`s client-side with realistic timings and feeds them into `getTraceStore()` from `livetrace/react`. Cards render with the same hooks (`useActiveTraces`, `useTrace`, `useTraceSteps`) that a real app would use. No backend needed - the marketing page is 100% static, so it deploys behind any CDN.

For a real backend end-to-end, see [`examples/demo-effect`](../../examples/demo-effect).
