import { readCssBundle } from './test-support/css';
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

const theme = readCssBundle('src/theme.css');
const indexCss = readCssBundle('src/index.css');
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


  it('botones por intencion (cargar celeste, exportar verde): texto >= 4,5:1 en los dos temas', () => {
    // Colores de src/core/ui/button.tsx (variantes upload y export) sobre su fondo: acento al 10 % sobre blanco o sobre #0e1b31.
    const button = fs.readFileSync('src/core/ui/button.tsx', 'utf8');
    for (const token of ['text-[#00587a]!', 'dark:text-[#8bd6f2]!', 'text-[#14532d]!', 'dark:text-[#86e0b0]!']) expect(button).toContain(token);
    expect(ratio('#8bd6f2', '#0d2942')).toBeGreaterThanOrEqual(4.5);   // oscuro: cargar
    expect(ratio('#86e0b0', '#112735')).toBeGreaterThanOrEqual(4.5);   // oscuro: exportar
    expect(ratio('#00587a', '#e6f6fc')).toBeGreaterThanOrEqual(4.5);   // claro: cargar
    expect(ratio('#14532d', '#eaf4ee')).toBeGreaterThanOrEqual(4.5);   // claro: exportar
  });

  it('pestañas animadas (.anim-tabs): texto y activo cumplen 4,5:1 sobre página, píldora y fondo oscuro', () => {
    expect(ratio('#4a5568', '#f4f6f9')).toBeGreaterThanOrEqual(4.5);   // claro: texto inactivo
    expect(ratio('#b84d00', '#fff0e6')).toBeGreaterThanOrEqual(4.5);   // claro: activo sobre la píldora
    expect(ratio('#b84d00', '#f4f6f9')).toBeGreaterThanOrEqual(4.5);   // claro: hover sobre la página
    expect(ratio('#a9bee0', '#0f1b30')).toBeGreaterThanOrEqual(4.5);   // oscuro: texto inactivo
    expect(ratio('#ffb27a', '#3a2a2e')).toBeGreaterThanOrEqual(4.5);   // oscuro: activo sobre la píldora (naranja 16 % sobre #0f1b30)
    expect(indexCss).toMatch(/\.anim-tabs\s*{[^}]*--tab-active:\s*#b84d00/);
    expect(indexCss).toMatch(/html\[data-theme='dark'\] \.anim-tabs\s*{[^}]*--tab-active:\s*#ffb27a/);
  });


  describe('tema oscuro (medido contra degradados)', () => {
    const css = readCssBundle('src/index.css');

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

  });

  it('placeholders en oscuro: #8ea3c4 cumple 4,5:1 sobre campo oscuro y sobre el extremo claro del degradado', () => {
    expect(ratio('#8ea3c4', '#0f1b30')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#8ea3c4', '#1b335e')).toBeGreaterThanOrEqual(4.5);
    expect(theme).toMatch(/:is\(input, textarea\)::placeholder\s*{\s*color:\s*#8ea3c4/);
  });
  it('hover y recortes: pestañas de Mantenimiento, primario y anillo hacia dentro', () => {
    expect(ratio('#b84d00', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#182b4a', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#182b4a', '#ff8533')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#9fb3d4', '#1b335e')).toBeGreaterThanOrEqual(4.5);
    expect(theme).toMatch(/\.primary-button:hover:not\(:disabled\)\s*{\s*background:\s*#ff8533/);
    expect(theme).toMatch(/\.module-nav \.nav-item[\s\S]*?\):focus-visible\s*{\s*outline-offset:\s*-3px/);
  });
  it('campos inválidos: borde y etiqueta cumplen en ambos temas y el CSS usa :user-invalid y aria-invalid', () => {
    for (const [fg, bg] of [['#b3261e', '#ffffff'], ['#b3261e', '#eef3f8'], ['#ff8a80', '#0f1b30'], ['#ff8a80', '#1b335e'], ['#ffb4ab', '#0f1b30'], ['#ffb4ab', '#1b335e']]) {
      expect(ratio(fg, bg), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(theme).toMatch(/select, textarea\):is\(:user-invalid, \[aria-invalid='true'\]\)\s*{\s*border-color:\s*#b3261e/);
    expect(theme).toMatch(/label:has\(/);
  });
  it('mensaje de error persistente: color AA en ambos temas', () => {
    expect(ratio('#b3261e', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#ffb4ab', '#1b335e')).toBeGreaterThanOrEqual(4.5);
    expect(theme).toMatch(/\.field-error\s*{[^}]*color:\s*#b3261e/);
    expect(theme).toMatch(/not\(\[data-theme='light'\]\) \.field-error\s*{\s*color:\s*#ffb4ab/);
  });
});
