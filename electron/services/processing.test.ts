import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitText, batchUnits, validateSummary } from './summarizer';
import { parseSegments, runProcess } from './transcriber';
const document={overview:'Resumen basado en evidencia',topics:[{text:'Tema',sources:[0]}],decisions:[],actions:[{task:'Comprobar audio',responsible:null,dueDate:null,sources:[1]}]};
test('UTF-8 splitting conserves Unicode exactly and respects every byte budget',()=>{
  const text='Ñandú 🦜 acción\n'.repeat(1000),parts=splitText(text,257);assert.equal(parts.join(''),text);for(const part of parts)assert.ok(Buffer.byteLength(part)<=257);
});
test('batching uses LF on every platform, fits exact boundaries, and refuses silent truncation',()=>{
  const units=['ñ'.repeat(63),'a','🦜'.repeat(30)],batches=batchUnits(units,128);assert.deepEqual(batches.flatMap(batch=>batch.trimEnd().split('\n')),units);for(const batch of batches)assert.ok(Buffer.byteLength(batch)<=128);assert.throws(()=>batchUnits(['🦜'.repeat(33)],128));
});
test('summaries require existing integer citations and nullable explicit responsibilities',()=>{
  assert.deepEqual(validateSummary(document,new Set([0,1])),document);
  for(const bad of [{...document,topics:[{text:'Tema',sources:[99]}]},{...document,topics:[{text:'Tema',sources:[0.5]}]},{...document,actions:[{task:'Acción',sources:[1]}]},{...document,overview:'a'.repeat(601)},{...document,actions:Array(13).fill(document.actions[0])}])assert.throws(()=>validateSummary(bad,new Set([0,1])));
});
test('Whisper parsing removes noise without changing spoken text or timing',()=>{
  const segments=parseSegments({transcription:[{text:' [ruido] ',offsets:{from:0,to:100}},{text:' Hola mundo ',offsets:{from:100,to:500}},{text:'(silencio)',offsets:{from:500,to:600}},{text:'Decisión',offsets:{from:600,to:1200}}]});
  assert.deepEqual(segments,[{seq:0,startMs:100,endMs:500,text:'Hola mundo'},{seq:1,startMs:600,endMs:1200,text:'Decisión'}]);
});
test('malformed Whisper output is rejected instead of being saved as an empty transcription',()=>{
  for(const output of [{},{transcription:[{text:null,offsets:{from:0,to:1}}]},{transcription:[{text:'Texto',offsets:{from:1,to:0}}]},{transcription:[{text:'Texto',offsets:{from:-1,to:2}}]}])assert.throws(()=>parseSegments(output));
});
test('cancellation terminates a real processing child and waits for its close',async()=>{
  const abort=new AbortController();
  await assert.rejects(runProcess(process.execPath,['-e','require("node:net").createServer().listen(0,"127.0.0.1",()=>console.log("ready"));'],abort.signal,()=>abort.abort()));
});
test('nonzero process exit never masquerades as successful processing',async()=>{
  await assert.rejects(runProcess(process.execPath,['-e','process.exit(23)'],new AbortController().signal));
});
