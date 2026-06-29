import { NextResponse } from 'next/server';

export async function GET() {
  const params = new URLSearchParams({
    response_type: 'code',
    scope: 'signature',
    client_id: process.env.DOCUSIGN_INTEGRATION_KEY ?? '',
    redirect_uri: process.env.DOCUSIGN_REDIRECT_URI ?? '',
    state: 'demo-user',
  });
  return NextResponse.redirect(`https://account-d.docusign.com/oauth/auth?${params.toString()}`);
}
