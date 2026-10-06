import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '../../core/unsavedChanges';
import type { MpsConsumable, MpsModel, SaveMpsModelInput } from './repository';
import { Copy, Plus, Save, Trash2, X } from 'lucide-react';
import { cn } from '../../core/cn';
import { dialogPanel } from '../../core/dialog';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { CardHeader, Muted } from '../../core/ui/card';
import { Input } from '../../core/ui/input';

type EditorMode = 'create' | 'edit' | 'clone';

type ConsumableDraft = {
  id?: string;
  name: string;
  type: string;
  yieldPages: string;
  color: string;
  sku: string;
};

type ModelDraft = {
  brand: string;
  model: string;
  speedPpm: string;
  isColor: boolean;
  recVolumeMin: string;
  recVolumeMax: string;
  consumables: ConsumableDraft[];
};

type MpsModelEditorProps = {
  mode: EditorMode;
  model: MpsModel | null;
  models: MpsModel[];
  saving: boolean;
  onCancel: () => void;
  onSave: (input: SaveMpsModelInput) => void;
};

const CONSUMABLE_TYPES = [
  ['toner', 'Tóner'],
  ['drum', 'Tambor'],
  ['developer', 'Revelador'],
  ['fuser', 'Fusor'],
  ['belt', 'Banda'],
  ['roller', 'Rodillo'],
  ['other', 'Otro'],
] as const;

const CONSUMABLE_COLORS = [
  ['black', 'Negro'],
  ['cyan', 'Cian'],
  ['magenta', 'Magenta'],
  ['yellow', 'Amarillo'],
  ['monochrome', 'Monocromático'],
  ['other', 'Otro'],
] as const;

const MONOCHROME_PRESET: readonly ConsumableDraft[] = [
  { name: 'Tóner Negro GPR-57', type: 'toner', yieldPages: '30000', color: 'black', sku: '2182C001AA' },
  { name: 'Unidad de Tambor GPR-57', type: 'drum', yieldPages: '150000', color: 'monochrome', sku: '2183C001AA' },
  { name: 'Kit Fusor GPR-57', type: 'fuser', yieldPages: '250000', color: 'monochrome', sku: '2184C001AA' },
];

const COLOR_PRESET: readonly ConsumableDraft[] = [
  { name: 'Tóner Negro GPR-61', type: 'toner', yieldPages: '36000', color: 'black', sku: '4813C001AA' },
  { name: 'Tóner Cian GPR-61', type: 'toner', yieldPages: '18000', color: 'cyan', sku: '4814C001AA' },
  { name: 'Tóner Magenta GPR-61', type: 'toner', yieldPages: '18000', color: 'magenta', sku: '4815C001AA' },
  { name: 'Tóner Amarillo GPR-61', type: 'toner', yieldPages: '18000', color: 'yellow', sku: '4816C001AA' },
  { name: 'Unidad de Tambor Negro', type: 'drum', yieldPages: '147000', color: 'black', sku: '4817C001AA' },
  { name: 'Unidad de Tambor Color', type: 'drum', yieldPages: '122000', color: 'other', sku: '4818C001AA' },
];

const selectClassName = 'h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy dark:border-sky/30 dark:bg-navy/50 dark:text-white';

export default function MpsModelEditor({ mode, model, models, saving, onCancel, onSave }: MpsModelEditorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<ModelDraft>(() => makeDraft(mode, model));
  const [copySourceId, setCopySourceId] = useState('');
  const [formError, setFormError] = useState('');
  useUnsavedChanges(JSON.stringify(draft) !== JSON.stringify(makeDraft(mode, model)));

  useEffect(() => {
    setDraft(makeDraft(mode, model));
    setCopySourceId('');
    setFormError('');
  }, [mode, model]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('input[name="brand"]')?.focus();
    }
    return () => dialog?.close();
  }, []);

  function updateDraft<K extends keyof ModelDraft>(key: K, value: ModelDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateConsumable(index: number, key: keyof ConsumableDraft, value: string) {
    setDraft((current) => ({
      ...current,
      consumables: current.consumables.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  }

  function addConsumable() {
    setDraft((current) => ({
      ...current,
      consumables: [...current.consumables, makeEmptyConsumable()],
    }));
  }

  function removeConsumable(index: number) {
    setDraft((current) => ({
      ...current,
      consumables: current.consumables.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function applyConsumablesPreset(preset: 'monochrome' | 'color') {
    const consumables = (preset === 'color' ? COLOR_PRESET : MONOCHROME_PRESET).map((item) => ({ ...item }));
    setDraft((current) => ({
      ...current,
      isColor: preset === 'color',
      consumables,
    }));
    setFormError('');
  }

  function copyFromModel() {
    const source = models.find((candidate) => candidate.id === copySourceId);
    if (!source) return;
    setDraft((current) => ({
      ...current,
      brand: source.brand,
      speedPpm: source.speedPpm === null ? '' : String(source.speedPpm),
      isColor: source.isColor,
      recVolumeMin: String(source.recVolumeMin),
      recVolumeMax: String(source.recVolumeMax),
      consumables: source.consumables.map(toDraftConsumable),
    }));
    setFormError('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const brand = draft.brand.trim();
    const modelLabel = draft.model.trim();
    const speedPpm = parseOptionalInteger(draft.speedPpm);
    const recVolumeMin = parseRequiredInteger(draft.recVolumeMin);
    const recVolumeMax = parseRequiredInteger(draft.recVolumeMax);

    if (!brand || !modelLabel) {
      setFormError('La marca y el modelo son obligatorios.');
      return;
    }
    if (speedPpm === undefined || recVolumeMin === undefined || recVolumeMax === undefined || recVolumeMax < recVolumeMin) {
      setFormError('PPM y volúmenes deben ser enteros válidos; el máximo no puede ser menor que el mínimo.');
      return;
    }
    if (draft.consumables.length === 0) {
      setFormError('Agrega al menos un consumible para poder proyectar reemplazos.');
      return;
    }

    const consumables: MpsConsumable[] = [];
    for (const item of draft.consumables) {
      const name = item.name.trim();
      const yieldPages = parseRequiredInteger(item.yieldPages);
      if (!name || !item.type || !item.color || yieldPages === undefined || yieldPages <= 0) {
        setFormError('Cada consumible necesita nombre, tipo, color y un rendimiento mayor a cero.');
        return;
      }
      consumables.push({
        id: item.id ?? '',
        name,
        type: item.type,
        yieldPages,
        color: item.color,
        sku: item.sku.trim(),
      });
    }

    onSave({
      id: mode === 'edit' ? model?.id : undefined,
      brand,
      model: modelLabel,
      speedPpm,
      isColor: draft.isColor,
      recVolumeMin,
      recVolumeMax,
      consumables,
    });
  }

  const title = mode === 'edit' ? 'Editar perfil MPS' : mode === 'clone' ? 'Duplicar perfil MPS' : 'Nuevo perfil MPS';
  const subtitle = mode === 'clone'
    ? 'Crea una variante independiente conservando los parámetros y consumibles del modelo base.'
    : 'Los perfiles manuales quedan guardados en SQLite y no se pierden al reimportar la base Canon.';

  return (
    <dialog
      ref={dialogRef}
      className={cn(dialogPanel, 'w-[min(64rem,calc(100vw-2rem))]')}
      aria-labelledby="mps-editor-title"
      aria-describedby="mps-editor-subtitle"
      onCancel={(event) => { event.preventDefault(); if (!saving) onCancel(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-navy/10 p-5 dark:border-sky/20">
          <div className="grid min-w-0 gap-2"><CardHeader eyebrow="PERFIL MANUAL" title={<span id="mps-editor-title">{title}</span>} /><Muted id="mps-editor-subtitle">{subtitle}</Muted></div>
          <Button variant="ghost" size="icon" onClick={onCancel} disabled={saving} aria-label="Cerrar editor"><X /></Button>
        </header>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="grid min-h-0 gap-5 overflow-y-auto p-5">
            {mode === 'clone' && model ? <div className="rounded-xl border border-sky/30 bg-sky/10 p-4 text-sm">Variante de <strong>{model.brand} {model.modelLabel}</strong>. Puedes cambiar el nombre, velocidad o volumen sin modificar el original.</div> : null}
            {models.length > 0 ? <div className="grid gap-3 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="grid content-center gap-1"><strong className="text-sm">Copiar parámetros e insumos</strong><Muted>Trae la configuración de otro modelo para evitar recargarla.</Muted></div>
              <div className="flex min-w-0 items-center gap-2"><select className={selectClassName} name="copySource" value={copySourceId} onChange={(event) => setCopySourceId(event.target.value)} aria-label="Modelo fuente para copiar"><option value="">Seleccionar modelo…</option>{models.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.brand} {candidate.modelLabel}</option>)}</select><Button variant="outline" onClick={copyFromModel} disabled={!copySourceId}><Copy />Copiar</Button></div>
            </div> : null}
            {formError ? <div className="rounded-xl border border-[#b42318]/30 bg-[#b42318]/5 p-4 text-sm text-[#b42318] dark:text-[#ffb0b7]" role="alert">{formError}</div> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold">Marca *<Input required pattern=".*\S.*" title="No puede quedar vacío ni solo con espacios." name="brand" value={draft.brand} onChange={(event) => updateDraft('brand', event.target.value)} placeholder="Canon" autoFocus /></label>
              <label className="grid gap-2 text-xs font-bold">Modelo *<Input required pattern=".*\S.*" title="No puede quedar vacío ni solo con espacios." name="model" value={draft.model} onChange={(event) => updateDraft('model', event.target.value)} placeholder="imageRUNNER ADVANCE…" /></label>
              <label className="grid gap-2 text-xs font-bold">Velocidad PPM<Input name="speedPpm" type="number" min="0" step="1" value={draft.speedPpm} onChange={(event) => updateDraft('speedPpm', event.target.value)} placeholder="Opcional" /></label>
              <label className="grid gap-2 text-xs font-bold">Tipo de equipo<select className={selectClassName} name="equipmentType" value={draft.isColor ? 'color' : 'mono'} onChange={(event) => updateDraft('isColor', event.target.value === 'color')}><option value="mono">Monocromático</option><option value="color">Color</option></select></label>
              <label className="grid gap-2 text-xs font-bold">Volumen mínimo / mes<Input name="recVolumeMin" type="number" min="0" step="1" value={draft.recVolumeMin} onChange={(event) => updateDraft('recVolumeMin', event.target.value)} /></label>
              <label className="grid gap-2 text-xs font-bold">Volumen máximo / mes<Input name="recVolumeMax" type="number" min="0" step="1" value={draft.recVolumeMax} onChange={(event) => updateDraft('recVolumeMax', event.target.value)} /></label>
            </div>

            <section className="grid gap-4 border-t border-navy/10 pt-5 dark:border-sky/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1"><h3 className="m-0 text-base font-bold">Consumibles del perfil</h3><Muted>Define rendimiento, tipo, color y SKU para la proyección anual.</Muted></div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => applyConsumablesPreset('monochrome')}>Cargar monocromo</Button>
                  <Button variant="outline" size="sm" onClick={() => applyConsumablesPreset('color')}>Cargar color</Button>
                  <Button variant="outline" size="sm" onClick={addConsumable}><Plus />Agregar consumible</Button>
                </div>
              </div>
              <div className="grid gap-3">
                {draft.consumables.map((item, index) => <div className="grid min-w-0 gap-3 rounded-xl border border-navy/10 bg-paper/60 p-4 dark:border-sky/20 dark:bg-navy/30" key={`${item.id ?? 'new'}-${index}`}>
                  <div className="flex items-center justify-between gap-3"><Badge>Consumible {String(index + 1).padStart(2, '0')}</Badge><Button variant="ghost" size="sm" onClick={() => removeConsumable(index)} aria-label={`Quitar ${item.name || 'consumible'}`}><Trash2 />Quitar</Button></div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="grid min-w-0 gap-2 text-xs font-bold sm:col-span-2 lg:col-span-1">Nombre<Input required pattern=".*\S.*" title="No puede quedar vacío ni solo con espacios." name={`consumable-${index}-name`} value={item.name} onChange={(event) => updateConsumable(index, 'name', event.target.value)} placeholder="Tóner negro" /></label>
                    <label className="grid min-w-0 gap-2 text-xs font-bold">Tipo<select className={selectClassName} name={`consumable-${index}-type`} value={item.type} onChange={(event) => updateConsumable(index, 'type', event.target.value)}>{CONSUMABLE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="grid min-w-0 gap-2 text-xs font-bold">Rendimiento<Input required name={`consumable-${index}-yield`} type="number" min="1" step="1" value={item.yieldPages} onChange={(event) => updateConsumable(index, 'yieldPages', event.target.value)} /></label>
                    <label className="grid min-w-0 gap-2 text-xs font-bold">Color<select className={selectClassName} name={`consumable-${index}-color`} value={item.color} onChange={(event) => updateConsumable(index, 'color', event.target.value)}>{CONSUMABLE_COLORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="grid min-w-0 gap-2 text-xs font-bold sm:col-span-1 lg:col-span-2">SKU<Input name={`consumable-${index}-sku`} value={item.sku} onChange={(event) => updateConsumable(index, 'sku', event.target.value)} placeholder="Opcional" /></label>
                  </div>
                </div>)}
                {draft.consumables.length === 0 ? <Muted className="rounded-xl border border-dashed border-navy/20 p-5 text-center dark:border-sky/30">Aún no hay consumibles. Agrega al menos uno.</Muted> : null}
              </div>
            </section>
          </div>
          <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-navy/10 p-5 dark:border-sky/20">
            <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving} aria-busy={saving}><Save />{saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear perfil'}</Button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}

function makeDraft(mode: EditorMode, model: MpsModel | null): ModelDraft {
  if (model) {
    return {
      brand: model.brand,
      model: mode === 'clone' ? `${model.modelLabel} (copia)` : model.modelLabel,
      speedPpm: model.speedPpm === null ? '' : String(model.speedPpm),
      isColor: model.isColor,
      recVolumeMin: String(model.recVolumeMin),
      recVolumeMax: String(model.recVolumeMax),
      consumables: model.consumables.map(toDraftConsumable),
    };
  }
  return {
    brand: 'Canon',
    model: '',
    speedPpm: '30',
    isColor: false,
    recVolumeMin: '2000',
    recVolumeMax: '10000',
    consumables: [
      { id: 'default-toner', name: 'Tóner Negro', type: 'toner', yieldPages: '25000', color: 'black', sku: 'GPR-TN-BLK' },
      { id: 'default-drum', name: 'Unidad de Tambor', type: 'drum', yieldPages: '100000', color: 'monochrome', sku: 'GPR-DR-MCH' },
    ],
  };
}

function makeEmptyConsumable(): ConsumableDraft {
  return { name: '', type: 'toner', yieldPages: '15000', color: 'black', sku: '' };
}

function toDraftConsumable(consumable: MpsConsumable): ConsumableDraft {
  return {
    id: consumable.id,
    name: consumable.name,
    type: consumable.type,
    yieldPages: String(consumable.yieldPages),
    color: consumable.color,
    sku: consumable.sku,
  };
}

function parseRequiredInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseOptionalInteger(value: string): number | null | undefined {
  if (!value.trim()) return null;
  return parseRequiredInteger(value);
}
