/**
 * Escapa caracteres especiais HTML para prevenir XSS injection
 * em templates gerados com Puppeteer (PDF) e contextos similares.
 *
 * Substitui os 5 caracteres perigosos pelas entidades HTML correspondentes:
 *   &  →  &amp;
 *   <  →  &lt;
 *   >  →  &gt;
 *   "  →  &quot;
 *   '  →  &#39;
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
