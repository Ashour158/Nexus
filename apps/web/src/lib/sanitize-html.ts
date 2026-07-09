/**
 * Minimal HTML sanitizer for rendering tenant-authored rich content
 * (e.g. campaign `contentHtml`) via `dangerouslySetInnerHTML`.
 *
 * Prefers DOMPurify (already a dependency) when a DOM is available, and falls
 * back to a conservative regex strip during SSR / non-DOM contexts. The regex
 * fallback removes `<script>`/`<style>` blocks, `on*=` event-handler
 * attributes, and `javascript:` / `vbscript:` URIs.
 */
import DOMPurify from 'dompurify';

function regexStrip(html: string): string {
  return html
    // Drop <script>…</script> and <style>…</style> blocks (and unclosed tags).
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style)\b[^>]*>/gi, '')
    // Strip on*="…" / on*='…' / on*=value event-handler attributes.
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    // Neutralise javascript:/vbscript: URIs.
    .replace(/\b(href|src|xlink:href)\s*=\s*"(?:\s|&nbsp;)*(?:javascript|vbscript):[^"]*"/gi, '$1="#"')
    .replace(/\b(href|src|xlink:href)\s*=\s*'(?:\s|&nbsp;)*(?:javascript|vbscript):[^']*'/gi, "$1='#'")
    .replace(/(?:javascript|vbscript):/gi, 'unsafe:');
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  if (typeof window !== 'undefined' && typeof DOMPurify?.sanitize === 'function') {
    return DOMPurify.sanitize(html);
  }
  return regexStrip(html);
}
