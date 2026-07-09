import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id') ?? 'demo-user';
  const base = process.env.EMAIL_SYNC_SERVICE_URL;
  if (base) {
    const res = await fetch(`${base}/oauth/gmail/init?userId=${encodeURIComponent(userId)}`);
    const data = await res.json().catch(() => ({}));
    if (data?.url) return NextResponse.redirect(data.url);
  }
  return NextResponse.redirect('https://accounts.google.com/');
}
