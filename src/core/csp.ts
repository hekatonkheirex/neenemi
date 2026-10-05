import { createHash } from 'node:crypto';

/** Hashes sha256 de los <script> en línea del HTML (el de tema evita el parpadeo claro/oscuro al arrancar). */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hashes.push(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  }
  return hashes;
}

/**
 * Política de la Suite empaquetada. Todo es local salvo los mosaicos de OpenStreetMap (<image> del mapa de Tracking);
 * Photon, OSRM y OpenRouter se llaman desde el servidor, no desde la página, así que connect-src queda en 'self'.
 * Los estilos en línea los usan React y Framer Motion (atributo style).
 */
export function buildContentSecurityPolicy(indexHtml: string): string {
  return [
    "default-src 'self'",
    `script-src ${["'self'", "'wasm-unsafe-eval'", ...inlineScriptHashes(indexHtml)].join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
