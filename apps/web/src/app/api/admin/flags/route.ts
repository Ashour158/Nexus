import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { requireAdmin } from '@/lib/admin-auth';

const FLAGS_FILE = path.join(process.cwd(), 'data', 'feature-flags.json');

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const data = await readFile(FLAGS_FILE, 'utf8');
    return NextResponse.json(JSON.parse(data) as unknown);
  } catch {
    return NextResponse.json({ flags: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    await mkdir(path.dirname(FLAGS_FILE), { recursive: true });
    await writeFile(FLAGS_FILE, JSON.stringify(body, null, 2), 'utf8');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
