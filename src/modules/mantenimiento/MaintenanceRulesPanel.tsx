import { useState } from 'react';
import type { MaintenanceModelRule } from './analysis';

type RuleDraft = {
  id?: string;
  modelLabel: string;
  usefulLife: string;
  monthlyRange: string;
  optimalBase: string;
  maxWaste: string;
};

const OPTIMAL_BASE_FACTOR = 0.65;

export default function MaintenanceRulesPanel({
  rules,
  disabled,
  onChanged,
  onError,
}: {
  rules: readonly MaintenanceModelRule[];
  disabled?: boolean;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [saving, setSaving] = useState(false);

  function startNewRule() {
    setDraft({
      modelLabel: '',
      usefulLife: '1000000',
      monthlyRange: String(Math.round(10000 / OPTIMAL_BASE_FACTOR)),
      optimalBase: '10000',
      maxWaste: '0.7',
    });
  }

  function startEdit(rule: MaintenanceModelRule) {
    setDraft({
      id: rule.id,
      modelLabel: rule.modelLabel,
      usefulLife: String(rule.usefulLife),
      monthlyRange: String(Math.round(rule.optimalBase / OPTIMAL_BASE_FACTOR)),
      optimalBase: String(rule.optimalBase),
      maxWaste: String(rule.maxWaste),
    });
  }

  async function saveRule() {
    if (!draft || !draft.modelLabel.trim()) {
      onError('Escribe el nombre del modelo para guardar la regla.');
      return;
    }
    const usefulLife = Number(draft.usefulLife);
    const monthlyRange = Number(draft.monthlyRange);
    const optimalBase = Number(draft.optimalBase);
    const maxWaste = Number(draft.maxWaste);
    if (!Number.isInteger(usefulLife) || usefulLife <= 0 || !Number.isInteger(monthlyRange) || monthlyRange <= 0 || !Number.isInteger(optimalBase) || optimalBase <= 0 || !Number.isFinite(maxWaste) || maxWaste < 0 || maxWaste > 1) {
      onError('La vida útil, el rango mensual y el óptimo deben ser enteros positivos; la merma debe estar entre 0 y 1.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/maintenance/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          modelLabel: draft.modelLabel,
          usefulLife,
          optimalBase,
          maxWaste,
        }),
      });
      await readJson<MaintenanceModelRule>(response);
      setDraft(null);
      onChanged(draft.id ? 'Regla actualizada.' : 'Regla de modelo agregada.');
    } catch (error: unknown) {
      onError(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(rule: MaintenanceModelRule) {
    if (!window.confirm(`¿Eliminar la regla ${rule.modelLabel}?`)) return;
    try {
      const response = await fetch(`/api/maintenance/rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' });
      const result = await readJson<{ deleted: boolean }>(response);
      onChanged(result.deleted ? 'Regla eliminada.' : 'La regla ya no estaba disponible.');
    } catch (error: unknown) {
      onError(toErrorMessage(error));
    }
  }

  async function resetRules() {
    if (!window.confirm('Se restaurarán los límites base del Gestor de Mantenimiento. ¿Continuar?')) return;
    try {
      const response = await fetch('/api/maintenance/rules/reset', { method: 'POST' });
      const result = await readJson<{ rules: MaintenanceModelRule[] }>(response);
      onChanged(`Se restauraron ${result.rules.length.toLocaleString('es-PY')} reglas base.`);
    } catch (error: unknown) {
      onError(toErrorMessage(error));
    }
  }

  return (
    <section className="sales-card form-card maintenance-rules-card">
      <div className="card-heading">
        <div><div className="eyebrow">CONFIGURACIÓN DEL ANÁLISIS</div><h2>Límites por modelo</h2></div>
        <span className="muted-note">{rules.length} reglas</span>
      </div>
      <p className="form-hint">Estas reglas conservan la vida útil, el rango mensual recomendado, el óptimo base y la merma del gestor antiguo. El óptimo base se calcula al 65% del rango mensual; los cambios se aplican a las lecturas activas.</p>
      {rules.length === 0 ? <p className="empty-inline">Importa una base o un archivo de contadores para habilitar las reglas.</p> : (
        <div className="maintenance-rules-list">
          {rules.map((rule) => <div className="maintenance-rule-row" key={rule.id}>
            <div><strong>{rule.modelLabel}</strong><small>{rule.usefulLife.toLocaleString('es-PY')} páginas · rango {Math.round(rule.optimalBase / OPTIMAL_BASE_FACTOR).toLocaleString('es-PY')} · óptimo {rule.optimalBase.toLocaleString('es-PY')} · merma {(rule.maxWaste * 100).toLocaleString('es-PY')}%</small></div>
            <div className="maintenance-rule-actions"><button className="text-button" type="button" onClick={() => startEdit(rule)} disabled={disabled || saving}>Editar</button><button className="text-button danger-text-button" type="button" onClick={() => void deleteRule(rule)} disabled={disabled || saving}>Quitar</button></div>
          </div>)}
        </div>
      )}
      <div className="maintenance-rules-footer"><button className="secondary-button" type="button" onClick={startNewRule} disabled={disabled || saving}>+ Agregar regla</button><button className="text-button" type="button" onClick={() => void resetRules()} disabled={disabled || saving}>Restaurar base</button></div>
      {draft ? <div className="maintenance-rule-editor">
        <div className="eyebrow">{draft.id ? 'EDITAR REGLA' : 'NUEVA REGLA'}</div>
        <label className="search-field"><span>Modelo / familia</span><input value={draft.modelLabel} onChange={(event) => setDraft((current) => current ? { ...current, modelLabel: event.target.value } : current)} placeholder="CANON iR ADV 525" /></label>
        <div className="maintenance-rule-inputs">
          <label className="search-field"><span>Vida útil</span><input type="number" min="1" step="1" value={draft.usefulLife} onChange={(event) => setDraft((current) => current ? { ...current, usefulLife: event.target.value } : current)} /></label>
          <label className="search-field"><span>Rango mensual recomendado</span><input type="number" min="1" step="1" value={draft.monthlyRange} onChange={(event) => setDraft((current) => current ? { ...current, monthlyRange: event.target.value, optimalBase: String(Math.round((Number(event.target.value) || 0) * OPTIMAL_BASE_FACTOR)) } : current)} /></label>
          <label className="search-field"><span>Óptimo base (65%)</span><input type="number" min="1" step="1" value={draft.optimalBase} readOnly /></label>
          <label className="search-field"><span>Merma máxima</span><input type="number" min="0" max="1" step="0.01" value={draft.maxWaste} onChange={(event) => setDraft((current) => current ? { ...current, maxWaste: event.target.value } : current)} /></label>
        </div>
        <div className="maintenance-rule-editor-actions"><button className="secondary-button" type="button" onClick={() => setDraft(null)} disabled={saving}>Cancelar</button><button className="primary-button" type="button" onClick={() => void saveRule()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar regla'}</button></div>
      </div> : null}
    </section>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'La API local devolvió un error.';
    throw new Error(error);
  }
  return body as T;
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'No se pudo completar la operación.';
}
