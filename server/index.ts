import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, service: 'arkade-bar' }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api on http://localhost:${info.port}`);
});
