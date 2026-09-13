# Signing-secret transition

Production uses the existing `mnhl_shorteener` D1, `LINKS_KV`, `link-analytics`
Queue and `mnhl.me` custom domain pinned in `wrangler.toml`. Do not recreate or
reset these resources during deployment. Local secrets belong in ignored
`.dev.vars` or `.env` files; `.dev.vars.example` contains no production key.

`HMAC_SECRET` is required. `HMAC_PREVIOUS_SECRET` is optional and temporarily
accepts signatures from callers using the previous secret. Request signing and
tenant routing retain the existing wire format. Remove the previous binding
only after every caller, including the VPS recovery path, uses the new key.

Prepare a private mode-0600 JSON or dotenv file containing both bindings. With
this repository's Wrangler version, upload the compatible code as an inactive
version, record its version ID, then use `wrangler versions secret bulk <file>`.
That command copies the latest uploaded version; verify its identity immediately
before the command and verify the resulting code, bindings and deployment state
afterward. Concurrent releases must not interleave these operations. Neither
step authorizes activation or changes to routes, Queue consumers or data.

Activate only through the reviewed release procedure after rehearsal. Verify
both old and new callers during overlap. Once callers and recovery use the new
key, stage removal with `wrangler versions secret delete HMAC_PREVIOUS_SECRET`,
activate the reviewed version, and prove old signatures return 401 while new
signatures and existing short links still work. A Worker rollback does not
restore D1, KV or Queue state. Never roll back to a version that accepts a
retired secret.

Local proof: `bun test tests/hmac-auth.test.ts`, `bun run typecheck`, and
`bunx wrangler deploy --dry-run --config wrangler.toml`.
