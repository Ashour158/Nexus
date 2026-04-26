export function renderContractHtml(data: Record<string, unknown>): string {
  return `<!doctype html><html><body><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
}
