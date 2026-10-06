import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import type { MaintenanceModelRule } from './analysis';
import { confirmAction } from '../../core/confirm';
import { useUnsavedChanges } from '../../core/unsavedChanges';
import { readJson, toErrorMessage } from '../../core/http';
import { cn } from '../../core/cn';
import { dialogPanel } from '../../core/dialog';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Input } from '../../core/ui/input';

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
  const [draftBaseline, setDraftBaseline] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  useUnsavedChanges(draft !== null && JSON.stringify(draft) !== draftBaseline);

  function openDraft(next: RuleDraft) {
    setDraftBaseline(JSON.stringify(next));
    setFormError('');
    setDraft(next);
  }

  function startNewRule() {
    openDraft({
      modelLabel: '',
      usefulLife: '1000000',
      monthlyRange: String(Math.round(10000 / OPTIMAL_BASE_FACTOR)),
      optimalBase: '10000',
      maxWaste: '0.7',
    });
  }

  function startEdit(rule: MaintenanceModelRule) {
    openDraft({
      id: rule.id,
      modelLabel: rule.modelLabel,
      usefulLife: String(rule.usefulLife),
      monthlyRange: String(Math.round(rule.optimalBase / OPTIMAL_BASE_FACTOR)),
      optimalBase: String(rule.optimalBase),
      maxWaste: String(rule.maxWaste),
    });
  }

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    if (!draft || !draft.modelLabel.trim()) {
      setFormError('Escribe el nombre del modelo para guardar la regla.');
      return;
    }
    const usefulLife = Number(draft.usefulLife);
    const monthlyRange = Number(draft.monthlyRange);
    const optimalBase = Number(draft.optimalBase);
    const maxWaste = Number(draft.maxWaste);
    if (!Number.isInteger(usefulLife) || usefulLife <= 0 || !Number.isInteger(monthlyRange) || monthlyRange <= 0 || !Number.isInteger(optimalBase) || optimalBase <= 0 || !Number.isFinite(maxWaste) || maxWaste < 0 || maxWaste > 1) {
      setFormError('La vida útil, el rango mensual y el óptimo deben ser enteros positivos; la merma debe estar entre 0 y 1.');
      return;
    }

    setSaving(true);
    setFormError('');
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
      setFormError(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(rule: MaintenanceModelRule) {
    if (!await confirmAction({
      title: 'Eliminar regla',
      message: `Se eliminará la regla ${rule.modelLabel}.`,
      confirmLabel: 'Eliminar regla',
    })) return;
    try {
      const response = await fetch(`/api/maintenance/rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' });
      const result = await readJson<{ deleted: boolean }>(response);
      onChanged(result.deleted ? 'Regla eliminada.' : 'La regla ya no estaba disponible.');
    } catch (error: unknown) {
      onError(toErrorMessage(error));
    }
  }

  async function resetRules() {
    if (!await confirmAction({
      title: 'Restaurar límites base',
      message: 'Se restaurarán los límites base del Gestor de Mantenimiento.',
      confirmLabel: 'Restaurar límites',
    })) return;
    try {
      const response = await fetch('/api/maintenance/rules/reset', { method: 'POST' });
      const result = await readJson<{ rules: MaintenanceModelRule[] }>(response);
      onChanged(`Se restauraron ${result.rules.length.toLocaleString('es-PY')} reglas base.`);
    } catch (error: unknown) {
      onError(toErrorMessage(error));
    }
  }

  return (
    <Card className="min-w-0 grid-cols-1 [overflow-wrap:anywhere]">
      <CardHeader eyebrow="Configuración del análisis" title="Límites por modelo" aside={<Badge>{rules.length} reglas</Badge>} />
      <Muted className="text-sm leading-relaxed">Estas reglas conservan la vida útil, el rango mensual recomendado, el óptimo base y la merma del gestor antiguo. El óptimo base se calcula al 65% del rango mensual; los cambios se aplican a las lecturas activas.</Muted>
      {rules.length === 0 ? <Muted className="rounded-xl border border-dashed border-navy/20 p-5 text-center text-sm dark:border-sky/30">Importa una base o un archivo de contadores para habilitar las reglas.</Muted> : (
        <div className="grid max-h-[32rem] gap-2 overflow-y-auto">
          {rules.map((rule) => <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-navy/10 bg-paper p-3 dark:border-sky/20 dark:bg-navy/30" key={rule.id}>
            <div className="grid min-w-0 gap-1"><div className="font-bold text-navy dark:text-white">{rule.modelLabel}</div><Muted>{rule.usefulLife.toLocaleString('es-PY')} páginas · rango {Math.round(rule.optimalBase / OPTIMAL_BASE_FACTOR).toLocaleString('es-PY')} · óptimo {rule.optimalBase.toLocaleString('es-PY')} · merma {(rule.maxWaste * 100).toLocaleString('es-PY')}%</Muted></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => startEdit(rule)} disabled={disabled || saving} aria-label={`Editar ${rule.modelLabel}`}><Pencil />Editar</Button>
              <Button variant="ghost" size="sm" onClick={() => void deleteRule(rule)} disabled={disabled || saving} aria-label={`Quitar ${rule.modelLabel}`}><Trash2 />Quitar</Button>
            </div>
          </div>)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={startNewRule} disabled={disabled || saving}><Plus />Agregar regla</Button>
        <Button variant="ghost" onClick={() => void resetRules()} disabled={disabled || saving}><RotateCcw />Restaurar base</Button>
      </div>
      {draft ? <RuleEditor draft={draft} saving={saving} error={formError} onChange={setDraft} onCancel={() => setDraft(null)} onSubmit={(event) => void saveRule(event)} /> : null}
    </Card>
  );
}

function RuleEditor({ draft, saving, error, onChange, onCancel, onSubmit }: {
  draft: RuleDraft;
  saving: boolean;
  error: string;
  onChange: (update: (current: RuleDraft | null) => RuleDraft | null) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const field = (key: keyof RuleDraft, value: string) => onChange((current) => current ? { ...current, [key]: value } : current);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('input[name="modelLabel"]')?.focus();
    }
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={cn(dialogPanel, 'w-[min(40rem,calc(100vw-2rem))]')}
      aria-labelledby="rule-editor-title"
      onCancel={(event) => { event.preventDefault(); if (!saving) onCancel(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}
    >
      <form className="flex max-h-[calc(100vh-2rem)] flex-col" onSubmit={onSubmit}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-navy/10 p-5 dark:border-sky/20">
          <CardHeader eyebrow={draft.id ? 'Editar regla' : 'Nueva regla'} title={<span id="rule-editor-title">{draft.id ? 'Editar límite por modelo' : 'Nuevo límite por modelo'}</span>} />
          <Button variant="ghost" size="icon" onClick={onCancel} disabled={saving} aria-label="Cerrar editor"><X /></Button>
        </header>
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
          {error ? <div className="rounded-xl border border-[#b42318]/30 bg-[#b42318]/5 p-4 text-sm text-[#b42318] dark:text-[#ffb0b7]" role="alert">{error}</div> : null}
          <label className="grid gap-2 text-xs font-bold">Modelo / familia<Input name="modelLabel" value={draft.modelLabel} onChange={(event) => field('modelLabel', event.target.value)} placeholder="CANON iR ADV 525" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-xs font-bold">Vida útil<Input type="number" min="1" step="1" value={draft.usefulLife} onChange={(event) => field('usefulLife', event.target.value)} /></label>
            <label className="grid gap-2 text-xs font-bold">Rango mensual recomendado<Input type="number" min="1" step="1" value={draft.monthlyRange} onChange={(event) => onChange((current) => current ? { ...current, monthlyRange: event.target.value, optimalBase: String(Math.round((Number(event.target.value) || 0) * OPTIMAL_BASE_FACTOR)) } : current)} /></label>
            <label className="grid gap-2 text-xs font-bold">Óptimo base (65%)<Input type="number" min="1" step="1" value={draft.optimalBase} readOnly /></label>
            <label className="grid gap-2 text-xs font-bold">Merma máxima<Input type="number" min="0" max="1" step="0.01" value={draft.maxWaste} onChange={(event) => field('maxWaste', event.target.value)} /></label>
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-navy/10 p-5 dark:border-sky/20">
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button type="submit" disabled={saving} aria-busy={saving}><Save />{saving ? 'Guardando…' : 'Guardar regla'}</Button>
        </footer>
      </form>
    </dialog>
  );
}
