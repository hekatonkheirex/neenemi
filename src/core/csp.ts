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
 * style-src 'self' sin 'unsafe-inline': React y Framer Motion asignan estilos por CSSOM (element.style), que la política permite;
 * lo que bloquea son <style> y atributos style inyectados como texto. Los reportes con <style> propio (Cobertura, SLA) van a otra ventana
 * (data:) o a un archivo descargado, no a esta página.
 */
export function buildContentSecurityPolicy(indexHtml: string): string {
  return [
    "default-src 'self'",
    `script-src ${["'self'", "'wasm-unsafe-eval'", ...inlineScriptHashes(indexHtml)].join(' ')}`,
    "style-src 'self'",
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
