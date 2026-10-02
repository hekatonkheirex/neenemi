import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Pares texto/fondo que corregimos a mano en el tema claro; deben seguir cumpliendo WCAG AA (4,5:1 en texto pequeño).
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const theme = fs.readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const white = '#ffffff';
const page = '#f4f6f9';
const blueWash = '#e9f5fb';

describe('contraste del tema claro', () => {
  it.each([
    ['eyebrow', '#00698f', page],
    ['summary de detalles', '#00698f', white],
    ['texto subtle', '#58677d', white],
    ['naranja oscuro (pestaña activa)', '#b84d00', white],
    ['código', '#0b5d83', white],
    ['prioridad Mantenimiento', '#7a4a00', white],
    ['zona de carga de Cobertura (texto muted)', '#4a5568', blueWash],
    ['navy sobre naranja (botones)', '#1a2c4c', '#ff6b00'],
  ])('%s cumple 4,5:1', (_name, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('el CSS usa esos colores', () => {
    expect(theme).toMatch(/html\[data-theme='light'\] \.eyebrow\s*{\s*color:\s*#00698f/);
    expect(theme).toMatch(/--ds-subtle:\s*#58677d/);
    expect(theme).toMatch(/\.coverage-upload-dropzone\s*{[^}]*background:\s*var\(--ds-blue-wash\)/);
    expect(theme).toMatch(/\.software-category-tabs button\.active\s*{[^}]*background:\s*var\(--ds-blue-wash\)/);
  });

  it('Mantenimiento: las reglas válidas en los dos temas llevan html[data-theme] (sin él pierden frente a las claras)', () => {
    expect(theme).toMatch(/html\[data-theme\] \.maintenance-view-tabs button\.is-active,/);
    expect(theme).toMatch(/html\[data-theme\] \.maintenance-source-upload-primary,/);
    expect(theme).toMatch(/html\[data-theme\] \.page-content \.maintenance-view-tabs button:not\(\.is-active\) span:first-child\s*{\s*color:\s*#93a8ca/);
  });

  it('la barra azul marino de pestañas: los números claros cumplen 4,5:1', () => {
    expect(ratio('#93a8ca', '#182b4a')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#b84d00', white)).toBeGreaterThanOrEqual(4.5); // pestaña activa: píldora blanca con texto naranja oscuro
  });
});
