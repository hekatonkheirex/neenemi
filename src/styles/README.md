# Estilos

`src/index.css` y `src/theme.css` solo contienen `@import`. El CSS vive en `src/styles/index/` y `src/styles/theme/`, en trozos numerados.

- **El número es el orden de la cascada.** Los trozos son tramos contiguos del CSS original: no reordenar ni renumerar sin comparar el CSS compilado (`vite build`) antes y después.
- El nombre indica el módulo de la primera regla propia del tramo. No es propiedad exclusiva: varios módulos comparten clases (`sales-card`, `catalog-*`, `search-field`), y algunas reglas se apoyan en reglas anteriores del mismo tramo.
- Regla nueva de un módulo: agrégala al final del último trozo de ese módulo si no depende de una regla posterior de otro módulo; si necesita ganar a una regla compartida, va después de ella.
- `src/test-support/css.ts` (`readCssBundle`) resuelve los `@import` para los tests que revisan reglas.
