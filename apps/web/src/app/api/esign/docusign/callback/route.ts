import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect('/settings?tab=integrations&error=docusign');
  return NextResponse.redirect('/settings?tab=integrations&connected=docusign');
}
