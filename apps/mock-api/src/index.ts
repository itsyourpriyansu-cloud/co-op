import { networkInterfaces } from 'node:os';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { config } from './config';
import { Store } from './store';

const store = new Store({
  persist: config.persist,
  dataDir: config.dataDir,
  latencyMs: config.latencyMs,
});
const app = createApp({ store, version: config.version });

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  const lanUrls = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i!.address}:${info.port}`);
  // Plain ASCII: legacy Windows consoles garble typographic characters.
  console.log(`\n  TGSECCSL mock API  |  http://localhost:${info.port}`);
  if (lanUrls.length) console.log(`  For the phone (same Wi-Fi), use: ${lanUrls.join('  or  ')}`);
  console.log(
    `  Demo date ${store.db.demo.today} | latency ${config.latencyMs.join('-')} ms | persist ${config.persist}\n`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    store.flush();
    process.exit(0);
  });
}
