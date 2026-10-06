# Estilos

`src/index.css` y `src/theme.css` solo contienen `@import`. El CSS vive en `src/styles/index/` y `src/styles/theme/`, en trozos numerados.

- **El número es el orden de la cascada.** Los trozos son tramos contiguos del CSS original: no reordenar ni renumerar sin comparar el CSS compilado (`vite build`) antes y después.
- El nombre indica el módulo de la primera regla propia del tramo. No es propiedad exclusiva: varios módulos comparten clases (`sales-card`, `catalog-*`, `search-field`), y algunas reglas se apoyan en reglas anteriores del mismo tramo.
- Regla nueva de un módulo: agrégala al final del último trozo de ese módulo si no depende de una regla posterior de otro módulo; si necesita ganar a una regla compartida, va después de ella.
- `src/test-support/css.ts` (`readCssBundle`) resuelve los `@import` para los tests que revisan reglas.

## Colores

- Marca: `var(--ds-orange | --ds-sky | --ds-navy | --ds-border | --ds-ink)` (iguales en claro y oscuro).
- Tema oscuro: `--dk-XXXXXX` (definidos en `index/01-*.css`), un token por valor exacto. Los tonos casi iguales se fusionaron con ΔE2000 ≤ 2,5 respecto del canónico (el más usado): `#e7efff`, `#e5eeff`, `#dce9ff`, `#d8e7ff` → `#dce8fc`; `#93a8ca` → `#8fa5c7`. Quedan separados los que distan más de 2,5 (p. ej. `#edf4ff`, `#c8d6ed`, `#9ab0d0`, `#8298ba`, `#7890b8`, `#7187aa`).
- `src/styles/tokens.test.ts` falla si vuelve a aparecer uno de esos literales en `styles/index`. Color nuevo: usa un token existente o agrega uno.
