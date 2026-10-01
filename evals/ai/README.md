# Eval del análisis con IA (SLA y Software Selector)

Mide qué parte de los requisitos de 10 pliegos sintéticos (`fixtures.ts`) recupera el flujo completo de cada módulo con un modelo de OpenRouter.

- **Criterio de aprobación:** recall global de al menos 80 % (aciertos / esperados) en SLA y en Software Selector, y los 10 pliegos evaluados. Un pliego sin respuesta (cuota, saturación) deja la suite en `INCOMPLETE`. La precisión de Software se informa, no bloquea.
- **SLA:** un requisito esperado se acierta si su ancla (p. ej. `4 horas`, `99,5`, `multa`) aparece, sin tildes ni mayúsculas, en el texto o el resumen de algún requisito devuelto. Límite: es una coincidencia de texto, no una evaluación semántica.
- **Software Selector:** se compara la lista final de ids del catálogo contra los esperados.
- **Línea base:** la misma corrida con las reglas locales, para ver cuánto aporta el modelo.

```bash
OPENROUTER_API_KEY=... [EVAL_MODELS=modelo-a:free,modelo-b:free] npm run eval:ai
```

Hace 2 llamadas por pliego y por modelo (20 por modelo). Solo acepta modelos gratuitos (`:free`); sin clave sale con código 2 sin llamar a nada. El informe JSON queda en `/tmp/dcss-evals/`. No forma parte de `npm test`; el puntaje, los pliegos y las anclas se prueban sin red en `scoring.test.ts`, y el cliente de OpenRouter en `src/core/openrouter.test.ts`.
