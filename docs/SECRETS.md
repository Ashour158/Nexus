# Secrets Management — Runbook

The one remaining Phase-1 hardening item that needs **your decision + credentials**. This documents
the current state, the risk, and the concrete migration to an encrypted/vaulted model.

## Current state (and why it's a risk)
- Secrets live in a plaintext `.env` on the droplet (`/opt/nexus/.env`) plus a `secrets/` dir.
- The deploy flow does `git fetch && git reset --hard`. A `.env` that is **tracked** would be
  clobbered by the reset; an **untracked** `.env` survives but is undocumented and un-versioned.
- There is no rotation story and no audit of who can read them.
- **Incident precedent:** a `git reset --hard` has clobbered droplet secrets before — that is exactly
  the failure this fixes.

## Target: encrypted-at-rest secrets, decrypted only at deploy
Pick one. **SOPS + age** is the lowest-friction for a git-based droplet deploy; a managed vault is
better if you're already on a cloud that offers one.

### Option A — SOPS + age (recommended for this setup)
1. Install `sops` + `age` locally and on the droplet.
2. Generate an age keypair; keep the **private** key off git (droplet `/root/.config/sops/age/keys.txt`,
   and as a GitHub secret `SOPS_AGE_KEY` for CI). Commit the **public** key.
3. Create `secrets/prod.env.sops.yaml` (and `secrets/staging.env.sops.yaml`) — SOPS-encrypt the real
   values. These encrypted files ARE safe to commit; only holders of the age key can decrypt.
4. Deploy step decrypts to a runtime `.env` that is never committed:
   `sops -d secrets/prod.env.sops.yaml > .env` (add `.env` to `.gitignore` — verify it's not tracked
   so `git reset --hard` can't touch it).
5. Rotate by re-encrypting; `git log` on the `.sops.yaml` gives you an audit trail of *when* secrets
   changed (values stay encrypted).

### Option B — Managed vault (DO Secrets / AWS Secrets Manager / HashiCorp Vault)
1. Store each secret in the vault; grant the deploy identity read access.
2. Deploy step fetches secrets into the runtime environment (never written to a committed file).
3. Rotation + access audit are handled by the vault.

## Migration steps (either option)
1. Inventory current secrets: `JWT_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
   `INTERNAL_SERVICE_TOKEN`, any provider API keys, `SOPS_AGE_KEY`/vault creds.
2. Move them into the chosen store; produce the encrypted file or vault entries.
3. **Ensure `.env` is gitignored and untracked** (`git rm --cached .env` if it was ever tracked) so
   the deploy `git reset` can never clobber the runtime env again.
4. Update the deploy scripts / `cd.yml` to materialize `.env` from the store at deploy time
   (decrypt or fetch), before `docker compose up`.
5. Rotate every secret once during the cutover (assume the plaintext ones are compromised).
6. Verify a full deploy + smoke test reads the new secrets.

## Guardrails to keep
- `.env` and `secrets/*.env` (plaintext) stay in `.gitignore`; only `*.sops.*` / references are
  committed.
- CI `cd.yml` already references secrets via `${{ secrets.* }}` — never hardcode.
- Least privilege: the deploy identity can read secrets; developers cannot read prod secrets directly.
