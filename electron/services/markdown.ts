import type { MeetingDetail } from '../../src/shared/contracts';
export function clock(ms:number):string {
  const seconds=Math.floor(Math.max(0,ms)/1000),minutes=Math.floor(seconds/60)%60;
  return `${seconds>=3600 ? `${Math.floor(seconds/3600)}:` : ''}${String(minutes).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
export function markdown(detail:MeetingDetail, summary:boolean):string {
  if (!summary) return `# ${detail.meeting.title}\n\nFecha: ${detail.meeting.recordedAt}\n${detail.meeting.durationS!=null ? `Duración: ${clock(detail.meeting.durationS*1000)}\n` : ''}\n## Transcripción\n\n${detail.segments.map(segment=>`[${clock(segment.startMs)}] ${segment.text}`).join('\n')}\n`;
  const stored=detail.summary;if(!stored)throw new Error('Todavía no hay un resumen.');
  const refs=(sources:number[])=>'['+[...new Set(sources)].map(id=>detail.segments.find(segment=>segment.seq===id)).filter(segment=>segment!==undefined).map(segment=>clock(segment.startMs)).join(', ')+']';
  const document=stored.document;
  return `# ${detail.meeting.title}\n\n> Resumen generado por IA. Verifica acuerdos, nombres y fechas contra la transcripción.\nModelo: ${stored.model}\nGenerado: ${stored.generatedAt}\n\n## Resumen\n\n${document.overview}\n\n## Temas tratados\n\n${document.topics.map(item=>`- ${item.text} ${refs(item.sources)}`).join('\n')}\n\n## Decisiones y acuerdos\n\n${document.decisions.map(item=>`- ${item.text} ${refs(item.sources)}`).join('\n')}\n\n## Pendientes\n\n${document.actions.map(item=>`- ${item.task} — Responsable: ${item.responsible??'No mencionado'}; fecha: ${item.dueDate??'No mencionada'} ${refs(item.sources)}`).join('\n')}\n`;
}
export function safeFileName(title:string):string {
  let name=title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/^[ .-]+|[ .-]+$/g,'').slice(0,120)||'grabacion';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name='grabacion-'+name;
  return name+'.md';
}
