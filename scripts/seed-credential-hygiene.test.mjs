import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = fileURLToPath(new URL('.', import.meta.url));
const scripts = ['seed-commercial-live.mjs', 'seed-demo-live.mjs'];
const forbiddenFallback = ['Demo', '1234!'].join('');

for (const script of scripts) {
  test(`${script} exits before network activity when PASSWORD is missing`, () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'nexus-seed-hygiene-'));
    const marker = join(tempDir, 'fetch-called');
    const preload = join(tempDir, 'fetch-guard.mjs');
    writeFileSync(preload, `import { writeFileSync } from 'node:fs'; globalThis.fetch = async () => { writeFileSync(${JSON.stringify(marker)}, 'called'); throw new Error('fetch called'); };`);

    try {
      for (const password of [undefined, '']) {
        const env = { ...process.env };
        if (password === undefined) delete env.PASSWORD;
        else env.PASSWORD = password;
        const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, join(scriptsDir, script)], {
          env,
          encoding: 'utf8',
        });
        const output = `${result.stdout}\n${result.stderr}`;
        assert.equal(result.status, 1);
        assert.match(output, /PASSWORD is required/i);
        assert.match(output, /environment variable/i);
        assert.doesNotMatch(output, new RegExp(forbiddenFallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.throws(() => readFileSync(marker), /ENOENT/);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test(`${script} source contains no credential fallback or auth payload logging`, () => {
    const source = readFileSync(join(scriptsDir, script), 'utf8');
    assert.equal(source.includes(forbiddenFallback), false);
    assert.doesNotMatch(source, /PASSWORD:\s*process\.env\.PASSWORD\s*\|\|/);
    assert.doesNotMatch(source, /Login failed[^\n]*snippet\s*\(/);
    assert.doesNotMatch(source, /no accessToken[^\n]*snippet\s*\(/i);
    assert.doesNotMatch(source, /authenticated as|ownerId\(sub\)=|tenantId=|login=\$\{CFG\.EMAIL\}/);
    assert.doesNotMatch(source, /tempPassword|temporaryPassword/);
  });
}

test('generic snippets recursively redact sensitive keys in both modules', async () => {
  const fixture = {
    status: 'invalid request',
    nested: {
      password: 'one',
      token: 'two',
      accessToken: 'three',
      refreshToken: 'four',
      authorization: 'five',
      cookie: 'six',
      secret: 'seven',
      useful: { reason: 'validation failed' },
    },
  };

  for (const script of scripts) {
    const { snippet } = await import(pathToFileURL(join(scriptsDir, script)).href);
    const output = snippet(fixture, 2_000);
    assert.match(output, /validation failed/);
    assert.match(output, /invalid request/);
    for (const secret of ['one', 'two', 'three', 'four', 'five', 'six', 'seven']) {
      assert.equal(output.includes(secret), false);
    }
    assert.equal((output.match(/\[REDACTED\]/g) ?? []).length, 7);
  }
});
