import http from 'http';

/**
 * ClickHouse client for analytics queries.
 */

export interface ClickHouseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

// Reuse TCP connections to avoid connection churn under load
const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });

export class ClickHouseClient {
  private config: ClickHouseConfig;

  constructor(config: ClickHouseConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  async query<T = unknown>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
    const url = new URL('/', this.getBaseUrl());

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(`param_${key}`, String(value));
      }
    }

    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      // Use POST to avoid URL length limits on large queries
      const res = await fetch(url.toString(), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Basic ${auth}`,
          'X-ClickHouse-Database': this.config.database,
          'Content-Type': 'text/plain',
          'Accept-Encoding': 'gzip',
        },
        body: sql,
        // @ts-expect-error — node-fetch supports agent
        agent: keepAliveAgent,
      });

      if (!res.ok) {
        throw new Error(`ClickHouse query failed: ${res.status} ${await res.text()}`);
      }

      const text = await res.text();
      if (!text.trim()) return [];

      // Parse TSV format
      const lines = text.trim().split('\n');
      if (lines.length === 0) return [];

      // Simple JSON format if using FORMAT JSON
      if (sql.includes('FORMAT JSON')) {
        const data = JSON.parse(text) as { data: T[] };
        return data.data;
      }

      return lines as unknown as T[];
    } finally {
      clearTimeout(timeout);
    }
  }

  async insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return;
    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw new Error(`Invalid ClickHouse table name: ${table}`);
    }
    const columns = Object.keys(rows[0]);
    const sql = `INSERT INTO ${table} (${columns.join(',')}) FORMAT JSONEachRow`;
    const body = rows.map((row) => JSON.stringify(row)).join('\n');

    const url = new URL('/', this.getBaseUrl());
    url.searchParams.set('query', sql);

    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'X-ClickHouse-Database': this.config.database,
        'Content-Type': 'text/plain',
        'Accept-Encoding': 'gzip',
      },
      body,
      // @ts-expect-error — node-fetch supports agent
      agent: keepAliveAgent,
    });

    if (!res.ok) {
      throw new Error(`ClickHouse insert failed: ${res.status} ${await res.text()}`);
    }
  }

  async execute(sql: string): Promise<void> {
    await this.query(sql);
  }
}
