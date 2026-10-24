// Runtime configuration from environment variables (all optional).
//   PORT=4000  HOST=0.0.0.0 (so a phone on the same Wi-Fi can connect)
//   MOCK_LATENCY=200-600 | 0       MOCK_PERSIST=1 | 0       MOCK_DATA_DIR=.data

function parseLatency(raw: string | undefined): [number, number] {
  if (!raw) return [200, 600];
  const [min, max] = raw.split('-').map((n) => Number(n));
  const lo = Number.isFinite(min) ? Math.max(0, min ?? 0) : 0;
  const hi = Number.isFinite(max) ? Math.max(lo, max ?? lo) : lo;
  return [lo, hi];
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  latencyMs: parseLatency(process.env.MOCK_LATENCY),
  persist: process.env.MOCK_PERSIST !== '0',
  dataDir: process.env.MOCK_DATA_DIR ?? '.data',
  version: '0.1.0',
};

export type Config = typeof config;
