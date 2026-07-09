import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { requireAdmin } from '@/lib/admin-auth';

/**
 * Durable system settings store — same mechanism the feature-flags route uses
 * (a JSON file under `data/`). GET loads current settings (merged over defaults),
 * PUT/POST persists a full or partial patch. Admin-gated.
 */

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'system-settings.json');

interface SystemSettings {
  defaultCurrency: string;
  fromEmail: string;
  businessHoursStart: string; // "HH:MM"
  businessHoursEnd: string; // "HH:MM"
  businessTimezone: string;
  dataRetentionDays: number;
  updatedBy: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
  defaultCurrency: 'USD',
  fromEmail: 'no-reply@nexus.local',
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
  businessTimezone: 'UTC',
  dataRetentionDays: 365,
  updatedBy: 'system',
  updatedAt: new Date(0).toISOString(),
};

async function readSettings(): Promise<SystemSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SystemSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Coerces and validates the incoming patch against known fields. */
function sanitize(input: Record<string, unknown>): Partial<SystemSettings> {
  const out: Partial<SystemSettings> = {};
  if (typeof input.defaultCurrency === 'string') out.defaultCurrency = input.defaultCurrency.trim().slice(0, 8).toUpperCase();
  if (typeof input.fromEmail === 'string') out.fromEmail = input.fromEmail.trim().slice(0, 254);
  if (typeof input.businessTimezone === 'string') out.businessTimezone = input.businessTimezone.trim().slice(0, 64);
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof input.businessHoursStart === 'string' && timeRe.test(input.businessHoursStart)) out.businessHoursStart = input.businessHoursStart;
  if (typeof input.businessHoursEnd === 'string' && timeRe.test(input.businessHoursEnd)) out.businessHoursEnd = input.businessHoursEnd;
  if (input.dataRetentionDays != null) {
    const n = Number(input.dataRetentionDays);
    if (Number.isFinite(n)) out.dataRetentionDays = Math.max(1, Math.min(3650, Math.round(n)));
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status });
  }
  const settings = await readSettings();
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } });
}

async function save(req: NextRequest) {
  let identity;
  try {
    identity = await requireAdmin(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const current = await readSettings();
  const patch = sanitize(body.settings && typeof body.settings === 'object' ? (body.settings as Record<string, unknown>) : body);
  const next: SystemSettings = {
    ...current,
    ...patch,
    updatedBy: identity.userId || 'admin',
    updatedAt: new Date().toISOString(),
  };
  try {
    await mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    await writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    return NextResponse.json({ error: 'Failed to persist settings' }, { status: 500 });
  }
  return NextResponse.json({ settings: next });
}

export const PUT = save;
export const POST = save;
