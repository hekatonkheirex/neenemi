# Eval de Gemini (SLA y Software Selector)

Mide qué parte de los requisitos de 10 pliegos sintéticos (`fixtures.ts`) recupera el flujo completo de cada módulo.

- **Criterio de aprobación:** recall global de al menos 80 % (aciertos / esperados) con Gemini, en SLA y en Software Selector. La precisión de Software se informa, no bloquea.
- **SLA:** un requisito esperado se acierta si su ancla (p. ej. `4 horas`, `99,5`, `multa`) aparece, sin tildes ni mayúsculas, en el texto o el resumen de algún requisito devuelto. Límite: es una coincidencia de texto, no una evaluación semántica.
- **Software Selector:** se compara la lista final de ids del catálogo contra los esperados.
- **Línea base:** la misma corrida con las reglas locales, para ver cuánto aporta Gemini.

```bash
GEMINI_API_KEY=... npm run eval:gemini
```

Hace 20 llamadas de pago (2 por pliego). Sin clave sale con código 2 sin llamar a nada. El informe JSON queda en `/tmp/dcss-evals/`. No forma parte de `npm test`; el puntaje, los pliegos y las anclas se prueban sin red en `scoring.test.ts`.
