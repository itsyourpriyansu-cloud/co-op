import { EventEmitter } from 'node:events';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';

const CHANNEL = 'tgs_notifications';

export interface RealtimeEvent {
  recipientId: string;
  id: string;
  title: string;
}

/**
 * G9 (D-121): tells open console tabs that a notification arrived. PostgreSQL LISTEN / NOTIFY carries
 * it to every server, so it works with more than one instance and needs no extra service. One pooled
 * connection listens, and only while someone is subscribed.
 */
export class RealtimeHub {
  private readonly local = new EventEmitter();
  private client?: pg.PoolClient;
  private starting?: Promise<void>;
  private closed = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly log: FastifyBaseLogger,
  ) {
    this.local.setMaxListeners(0);
  }

  /** After the notification is stored. A failure only costs the live update; the bell still counts it. */
  async publish(e: RealtimeEvent): Promise<void> {
    await this.pool.query('select pg_notify($1, $2)', [CHANNEL, JSON.stringify({ recipientId: e.recipientId, id: e.id, title: e.title.slice(0, 200) })]).catch((err: Error) => this.log.warn({ err }, 'realtime publish failed'));
  }

  async subscribe(recipientId: string, fn: (e: RealtimeEvent) => void): Promise<() => void> {
    await this.listen();
    this.local.on(recipientId, fn);
    return () => void this.local.off(recipientId, fn);
  }

  private listen(): Promise<void> {
    this.starting ??= (async () => {
      const client = await this.pool.connect();
      client.on('notification', (msg) => {
        try {
          const e = JSON.parse(msg.payload ?? '') as RealtimeEvent;
          this.local.emit(e.recipientId, e);
        } catch {
          // Not ours; ignore.
        }
      });
      client.on('error', (err) => {
        this.log.warn({ err }, 'realtime connection lost');
        this.client = undefined;
        this.starting = undefined;
        client.release(err);
        if (!this.closed && this.local.eventNames().length) setTimeout(() => void this.listen().catch(() => undefined), 5_000).unref();
      });
      await client.query(`listen ${CHANNEL}`);
      this.client = client;
    })().catch((err: Error) => {
      this.starting = undefined;
      throw err;
    });
    return this.starting;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.local.removeAllListeners();
    const c = this.client;
    this.client = undefined;
    if (c) {
      await c.query(`unlisten ${CHANNEL}`).catch(() => undefined);
      c.release();
    }
  }
}
