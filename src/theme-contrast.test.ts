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

  it('Editor MPS: el texto pálido es solo el de la cabecera navy; la ayuda del cuerpo usa el gris del tema', () => {
    expect(theme).toMatch(/\.mps-editor-header p\s*{\s*color:\s*#d9e8f4/);
    expect(theme).toMatch(/\.mps-copy-row small,\s*html\[data-theme='light'\] \.mps-consumables-heading p\s*{\s*color:\s*var\(--ds-muted\)/);
    expect(ratio('#d9e8f4', '#1a2c4c')).toBeGreaterThanOrEqual(4.5); // sobre la cabecera navy sí se lee
    expect(ratio('#d9e8f4', white)).toBeLessThan(2);                  // sobre blanco no: por eso no puede compartir regla
  });

  describe('tema oscuro (medido contra degradados)', () => {
    const css = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');

    it.each([
      ['botón primario: texto sobre el extremo claro del degradado', '#eff5ff', '#3466cf'],
      ['botón primario: hover', '#eff5ff', '#3768d6'],
      ['pestaña activa de Consumibles', '#ffffff', '#c24d00'],
      ['gris secundario sobre tarjeta oscura', '#9fb3d4', '#1b335e'],
      ['rojo del tablero ejecutivo', '#ff8a93', '#1c1420'],
      ['ámbar del tablero ejecutivo', '#f0b44c', '#1c1420'],
      ['violeta del tablero ejecutivo', '#b9afff', '#141830'],
    ])('%s cumple 4,5:1', (_name, fg, bg) => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it('el CSS usa el degradado corregido del botón primario', () => {
      expect(css).toMatch(/\.primary-button\s*{[^}]*linear-gradient\(135deg, #3466cf, #2347a3\)/);
      expect(theme).toMatch(/html:not\(\[data-theme='light'\]\) \.consumables-tabs button\.active\s*{[^}]*#c24d00/);
    });

    it('la regla de grises secundarios no pisa el texto del botón de carga naranja', () => {
      expect(theme).not.toMatch(/\.maintenance-source-upload span/);
      expect(theme).toMatch(/\.maintenance-source-dropzone-copy span/);
    });
  });

  it('estados vacíos y de error: reglas para el selector de atajos (claro) y el reintento de Tracking (ambos temas)', () => {
    expect(theme).toMatch(/html\[data-theme='light'\] \.software-shortcut\s*{[^}]*background:\s*var\(--ds-surface-alt\)/);
    expect(theme).toMatch(/html\[data-theme\] \.tracking-error \.secondary-button\s*{[^}]*background:\s*#ffffff/);
    expect(ratio('#1a2c4c', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  describe('elementos que no son texto (WCAG 1.4.11 y 2.4.7): >= 3:1', () => {
    it.each([
      ['borde de campo, tema claro, sobre blanco', '#73869f', '#ffffff'],
      ['borde de campo, tema claro, sobre superficie alterna', '#73869f', '#eef3f8'],
      ['borde de campo, tema oscuro, sobre tarjeta', '#6b86ad', '#0f1b30'],
      ['borde de campo, tema oscuro, sobre extremo claro del degradado', '#6b86ad', '#1b335e'],
      ['anillo de foco oscuro sobre fondo oscuro', '#7cc4ff', '#09101c'],
      ['anillo de foco oscuro sobre tarjeta', '#7cc4ff', '#0f1b30'],
      ['anillo de foco claro sobre blanco', '#0b5d83', '#ffffff'],
      ['anillo de foco claro sobre la barra azul marino', '#7cc4ff', '#182b4a'],
    ])('%s', (_name, fg, bg) => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
    });

    it('el CSS fija bordes de campo, un anillo de foco único y el anillo claro de la barra marino', () => {
      expect(theme).toMatch(/html\[data-theme='light'\] :is\(input[\s\S]*?, select, textarea\)\s*{\s*border-color:\s*#73869f/);
      expect(theme).toMatch(/html\[data-theme\] :is\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible\s*{\s*outline:\s*3px solid var\(--focus-ring\)/);
      expect(theme).toMatch(/\.maintenance-view-tabs button:focus-visible\s*{\s*outline-color:\s*#7cc4ff/);
      expect(theme).toMatch(/\.mps-editor-close:focus-visible\s*{\s*outline-color:\s*#7cc4ff/);
      expect(theme).toMatch(/\.uniflow-quantity-control\s*{\s*border-color:\s*#73869f/);
    });
  });

  it('placeholders en oscuro: #8ea3c4 cumple 4,5:1 sobre campo oscuro y sobre el extremo claro del degradado', () => {
    expect(ratio('#8ea3c4', '#0f1b30')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#8ea3c4', '#1b335e')).toBeGreaterThanOrEqual(4.5);
    expect(theme).toMatch(/:is\(input, textarea\)::placeholder\s*{\s*color:\s*#8ea3c4/);
  });
});
