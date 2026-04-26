export function requireEnv(vars: string[]): Record<string, string> {
  const missing: string[] = [];
  const result: Record<string, string> = {};

  for (const key of vars) {
    const val = process.env[key];
    if (!val) {
      missing.push(key);
    } else {
      result[key] = val;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nCheck your .env file.`
    );
  }

  return result;
}

export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
