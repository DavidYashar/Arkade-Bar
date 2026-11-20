# Arkade Bar

A 3D arcade bar for Funtico. Blender authors the room, three.js plays it, one small Hono
service grades runs and settles matches.

## Run

```bash
npm install
npm run dev      # web on http://localhost:3400, api on 8787 (proxied at /api)
```

## Gates

```bash
npm run typecheck && npm run build && npm test
```

## Notes

- `TMP=.tmp` in the scripts: esbuild cannot delete temp files in the system temp folder on
  this machine (access denied at build). The scripts point it at `.tmp` in the project.
- `docs/DECISIONS.md` holds the stack decisions and what is still open.
- `server/index.ts` is the only server code. Everything else is the browser.
