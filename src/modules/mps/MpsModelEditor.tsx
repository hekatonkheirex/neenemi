import { useEffect, useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '../../core/unsavedChanges';
import type { MpsConsumable, MpsModel, SaveMpsModelInput } from './repository';

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

export default function MpsModelEditor({ mode, model, models, saving, onCancel, onSave }: MpsModelEditorProps) {
  const [draft, setDraft] = useState<ModelDraft>(() => makeDraft(mode, model));
  const [copySourceId, setCopySourceId] = useState('');
  const [formError, setFormError] = useState('');
  useUnsavedChanges(JSON.stringify(draft) !== JSON.stringify(makeDraft(mode, model)));

  useEffect(() => {
    setDraft(makeDraft(mode, model));
    setCopySourceId('');
    setFormError('');
  }, [mode, model]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, saving]);

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
    <div className="mps-editor-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <section className="mps-editor" role="dialog" aria-modal="true" aria-labelledby="mps-editor-title">
        <header className="mps-editor-header">
          <div><div className="eyebrow">PERFIL MANUAL</div><h2 id="mps-editor-title">{title}</h2><p>{subtitle}</p></div>
          <button className="mps-editor-close" type="button" onClick={onCancel} disabled={saving} aria-label="Cerrar editor">×</button>
        </header>

        <form className="mps-editor-form" onSubmit={submit}>
          <div className="mps-editor-body">
            {mode === 'clone' && model ? <div className="mps-editor-banner">Variante de <strong>{model.brand} {model.modelLabel}</strong>. Puedes cambiar el nombre, velocidad o volumen sin modificar el original.</div> : null}

            {models.length > 0 ? <div className="mps-copy-row">
              <div><strong>Copiar parámetros e insumos</strong><small>Trae la configuración de otro modelo para evitar recargarla.</small></div>
              <div className="mps-copy-controls"><select name="copySource" value={copySourceId} onChange={(event) => setCopySourceId(event.target.value)} aria-label="Modelo fuente para copiar"><option value="">Seleccionar modelo…</option>{models.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.brand} {candidate.modelLabel}</option>)}</select><button className="secondary-button" type="button" onClick={copyFromModel} disabled={!copySourceId}>Copiar</button></div>
            </div> : null}

            {formError ? <div className="mps-editor-error" role="alert">{formError}</div> : null}

            <div className="mps-editor-fields">
              <label className="search-field"><span>Marca *</span><input required pattern=".*\S.*" title="No puede quedar vacío ni solo con espacios." name="brand" value={draft.brand} onChange={(event) => updateDraft('brand', event.target.value)} placeholder="Canon" autoFocus /></label>
              <label className="search-field"><span>Modelo *</span><input required pattern=".*\S.*" title="No puede quedar vacío ni solo con espacios." name="model" value={draft.model} onChange={(event) => updateDraft('model', event.target.value)} placeholder="imageRUNNER ADVANCE…" /></label>
              <label className="search-field"><span>Velocidad PPM</span><input name="speedPpm" type="number" min="0" step="1" value={draft.speedPpm} onChange={(event) => updateDraft('speedPpm', event.target.value)} placeholder="Opcional" /></label>
              <label className="search-field"><span>Tipo de equipo</span><select name="equipmentType" value={draft.isColor ? 'color' : 'mono'} onChange={(event) => updateDraft('isColor', event.target.value === 'color')}><option value="mono">Monocromático</option><option value="color">Color</option></select></label>
              <label className="search-field"><span>Volumen mínimo / mes</span><input name="recVolumeMin" type="number" min="0" step="1" value={draft.recVolumeMin} onChange={(event) => updateDraft('recVolumeMin', event.target.value)} /></label>
              <label className="search-field"><span>Volumen máximo / mes</span><input name="recVolumeMax" type="number" min="0" step="1" value={draft.recVolumeMax} onChange={(event) => updateDraft('recVolumeMax', event.target.value)} /></label>
            </div>

            <div className="mps-consumables-editor">
              <div className="mps-consumables-heading">
                <div><div className="eyebrow">COMPONENTES</div><h3>Consumibles del perfil</h3><p>Define rendimiento, tipo, color y SKU para la proyección anual.</p></div>
                <div className="mps-consumables-actions">
                  <button className="secondary-button" type="button" onClick={() => applyConsumablesPreset('monochrome')}>Cargar monocromo</button>
                  <button className="secondary-button" type="button" onClick={() => applyConsumablesPreset('color')}>Cargar color</button>
                  <button className="secondary-button" type="button" onClick={addConsumable}>+ Agregar consumible</button>
                </div>
              </div>
              <div className="mps-consumable-editor-list">
                {draft.consumables.map((item, index) => <div className="mps-consumable-editor-row" key={`${item.id ?? 'new'}-${index}`}>
                  <div className="mps-consumable-index">{String(index + 1).padStart(2, '0')}</div>
                  <label className="search-field"><span>Nombre</span><input name={`consumable-${index}-name`} value={item.name} onChange={(event) => updateConsumable(index, 'name', event.target.value)} placeholder="Tóner negro" /></label>
                  <label className="search-field"><span>Tipo</span><select name={`consumable-${index}-type`} value={item.type} onChange={(event) => updateConsumable(index, 'type', event.target.value)}>{CONSUMABLE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="search-field"><span>Rendimiento</span><input name={`consumable-${index}-yield`} type="number" min="1" step="1" value={item.yieldPages} onChange={(event) => updateConsumable(index, 'yieldPages', event.target.value)} /></label>
                  <label className="search-field"><span>Color</span><select name={`consumable-${index}-color`} value={item.color} onChange={(event) => updateConsumable(index, 'color', event.target.value)}>{CONSUMABLE_COLORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="search-field"><span>SKU</span><input name={`consumable-${index}-sku`} value={item.sku} onChange={(event) => updateConsumable(index, 'sku', event.target.value)} placeholder="Opcional" /></label>
                  <button className="mps-remove-consumable" type="button" onClick={() => removeConsumable(index)} aria-label={`Quitar ${item.name || 'consumible'}`}>×</button>
                </div>)}
                {draft.consumables.length === 0 ? <div className="mps-editor-empty">Aún no hay consumibles. Agrega al menos uno.</div> : null}
              </div>
            </div>
          </div>
          <footer className="mps-editor-footer"><button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear perfil'}</button></footer>
        </form>
      </section>
    </div>
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
