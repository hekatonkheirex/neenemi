import { useEffect, useState } from 'react';
import { readJson, toErrorMessage } from '../../core/http';
import { MAX_LIST_LIMIT } from '../../core/list-limit';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { StatusLine } from '../../core/ui/status-line';
import ConsumablesClientRankingChart from './ConsumablesClientRankingChart';
import { buildClientRows, rankClientRows, type RankingClientRow } from './client-ranking';
import type { ConsumablesRecord } from './types';

type ChartState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clients: RankingClientRow[]; recordCount: number };

export default function DashboardConsumablesChart({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [state, setState] = useState<ChartState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    readJson<ConsumablesRecord[]>(fetch(`/api/consumables/records?limit=${MAX_LIST_LIMIT}`, { method: 'GET', signal: controller.signal }))
      .then((records) => {
        if (!controller.signal.aborted) setState({ status: 'ready', clients: rankClientRows(buildClientRows(records)), recordCount: records.length });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: toErrorMessage(error) });
      });
    return () => controller.abort();
  }, []);

  return (
    <Card className="min-w-0 grid-cols-1 [overflow-wrap:anywhere]" aria-label="Analítica de consumibles · Top 10 clientes por costo" aria-busy={state.status === 'loading'}>
      <CardHeader eyebrow="Analítica de consumibles" title="Top 10 clientes por costo" aside={state.status === 'ready' ? <Badge>{Math.min(state.clients.length, 10)} clientes visibles</Badge> : undefined} />
      <Muted className="text-sm">Mismos registros de uso normalizados del Ranking, incluidos repuestos, sin filtros del módulo. Costos acumulados en guaraníes, no precios de lista.</Muted>
      {state.status === 'loading' ? <StatusLine state="pending">Cargando el ranking de clientes de consumibles y repuestos…</StatusLine>
        : state.status === 'error' ? <StatusLine state="error">No se pudo cargar el ranking de clientes. {state.message}</StatusLine>
          : <div className="min-w-0 overflow-x-auto" role="region" aria-label="Gráfico desplazable del ranking de clientes" tabIndex={0}>
            <div className={state.clients.length > 0 ? 'min-w-[600px]' : undefined}><ConsumablesClientRankingChart rankedClients={state.clients} /></div>
          </div>}
      {state.status === 'ready' && state.recordCount >= MAX_LIST_LIMIT ? <Muted className="text-sm" role="status">Se alcanzó el límite de {MAX_LIST_LIMIT.toLocaleString('es-PY')} líneas por consulta, igual que en Ranking. El resultado puede no incluir todo el historial.</Muted> : null}
      <Button variant="outline" className="min-w-0 max-w-full justify-self-start whitespace-normal" onClick={() => onNavigate('consumibles')}>Ver Analítica de consumibles</Button>
    </Card>
  );
}
