import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MeetingsRepository } from './repository';
const document={overview:'Acuerdos locales',topics:[{text:'Conservar audio',sources:[0]}],decisions:[],actions:[]};
function profile(){const directory=mkdtempSync(join(tmpdir(),'neenemi-repo-test-'));return{directory,path:join(directory,'neenemi.sqlite')};}
test('schema 1 migration backs up originals and preserves audio, segments and customer associations',()=>{
  const p=profile();let repo=new MeetingsRepository(p.path);
  try{
    const customer=randomUUID();repo.db.prepare('INSERT INTO customers VALUES(?,?,?,?,?)').run(customer,'Histórico','historico','2020','2020');
    const meeting=repo.create('Histórico'),audio=Buffer.from([1,2,3,4]);repo.addChunk(meeting.id,0,audio);repo.saveTranscription(meeting.id,[{seq:0,startMs:10,endMs:500,text:'Audio histórico'}],1,false);
    repo.db.prepare('UPDATE meetings SET customer_id=? WHERE id=?').run(customer,meeting.id);
    repo.db.exec('DROP TABLE meeting_summaries; ALTER TABLE meetings DROP COLUMN audio_format; ALTER TABLE meetings DROP COLUMN sample_rate; PRAGMA user_version=1');repo.close();
    repo=new MeetingsRepository(p.path);assert.equal(repo.get(meeting.id).title,'Histórico');assert.equal(repo.detail(meeting.id).segments[0].text,'Audio histórico');
    assert.equal(repo.db.prepare('SELECT customer_id FROM meetings WHERE id=?').get(meeting.id)!.customer_id,customer);
    const backup=new DatabaseSync(p.path+'.before-native-v2.bak',{readOnly:true});try{assert.equal(backup.prepare('PRAGMA user_version').get()!.user_version,1);assert.deepEqual(Buffer.from(backup.prepare('SELECT data FROM meeting_audio_chunks').get()!.data as Uint8Array),audio);}finally{backup.close();}
    repo.writeAudio(meeting.id,join(p.directory,'historical.webm'));assert.deepEqual(readFileSync(join(p.directory,'historical.webm')),audio);
  }finally{repo.close();rmSync(p.directory,{recursive:true,force:true});}
});
test('existing schema 2 and summary remain intact; PCM chunks form an accurate WAV',()=>{
  const p=profile();let repo=new MeetingsRepository(p.path);
  try{const meeting=repo.create('PCM'),first=Buffer.from([1,0,2,0]),last=Buffer.from([3,0]);repo.addChunk(meeting.id,0,first);repo.addChunk(meeting.id,1,last);repo.saveTranscription(meeting.id,[{seq:0,startMs:0,endMs:100,text:'Texto'}],1,false);repo.saveSummary(meeting.id,document,'local');repo.close();repo=new MeetingsRepository(p.path);
    assert.deepEqual(repo.detail(meeting.id).summary?.document,document);assert.equal(existsSync(p.path+'.before-native-v2.bak'),false);
    const path=join(p.directory,'audio.wav');repo.writeAudio(meeting.id,path);const wav=readFileSync(path);assert.equal(wav.readUInt32LE(24),16000);assert.equal(wav.readUInt32LE(40),6);assert.deepEqual(wav.subarray(44),Buffer.concat([first,last]));
  }finally{repo.close();rmSync(p.directory,{recursive:true,force:true});}
});
test('DCSS and future versions cannot be opened as the active profile or mutated',()=>{
  for(const mode of ['dcss','future']){const p=profile(),db=new DatabaseSync(p.path);db.exec(mode==='dcss'?'CREATE TABLE schema_migrations(id INTEGER)':'PRAGMA user_version=99');db.close();
    try{assert.throws(()=>new MeetingsRepository(p.path));const check=new DatabaseSync(p.path,{readOnly:true});try{assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name='meetings'").get(),undefined);}finally{check.close();}}
    finally{rmSync(p.directory,{recursive:true,force:true});}
  }
});
test('read-only snapshot imports WAL commits, remaps normalized customers and never overwrites existing IDs',async()=>{
  const source=profile(),target=profile(),from=new MeetingsRepository(source.path),to=new MeetingsRepository(target.path);
  try{
    const customer=randomUUID(),existing=randomUUID();from.db.prepare('INSERT INTO customers VALUES(?,?,?,?,?)').run(customer,'Cliente','cliente','2020','2020');to.db.prepare('INSERT INTO customers VALUES(?,?,?,?,?)').run(existing,'Cliente','cliente','2021','2021');
    const meeting=from.create('Origen WAL');from.addChunk(meeting.id,0,Buffer.from([1,0]));from.saveTranscription(meeting.id,[{seq:0,startMs:0,endMs:100,text:'Conservado'}],1,false);from.saveSummary(meeting.id,document,'local');from.db.prepare('UPDATE meetings SET customer_id=? WHERE id=?').run(customer,meeting.id);
    assert.equal(await to.importFrom(source.path),1);assert.equal(to.db.prepare('SELECT customer_id FROM meetings WHERE id=?').get(meeting.id)!.customer_id,existing);
    to.db.prepare('UPDATE meetings SET title=? WHERE id=?').run('Destino modificado',meeting.id);assert.equal(await to.importFrom(source.path),0);assert.equal(to.get(meeting.id).title,'Destino modificado');assert.equal(from.get(meeting.id).title,'Origen WAL');assert.deepEqual(to.detail(meeting.id).summary?.document,document);
  }finally{from.close();to.close();rmSync(source.directory,{recursive:true,force:true});rmSync(target.directory,{recursive:true,force:true});}
});
test('PCM rejects missing, oversized, out-of-order and closed-session chunks',()=>{
  const p=profile(),repo=new MeetingsRepository(p.path);
  try{const meeting=repo.create('Bloques');for(const [seq,data]of [[1,Buffer.from([0,0])],[0,Buffer.alloc(0)],[0,Buffer.from([0])],[0,Buffer.alloc(960002)]] as const)assert.throws(()=>repo.addChunk(meeting.id,seq,data));
    assert.equal(repo.get(meeting.id).chunkCount,0);repo.addChunk(meeting.id,0,Buffer.from([0,0]));repo.finish(meeting.id);assert.throws(()=>repo.addChunk(meeting.id,1,Buffer.from([0,0])));assert.equal(repo.get(meeting.id).chunkCount,1);
  }finally{repo.close();rmSync(p.directory,{recursive:true,force:true});}
});
test('transcription and automatic summary queue commit atomically or roll back together',()=>{
  const p=profile(),repo=new MeetingsRepository(p.path);
  try{const meeting=repo.create('Transacción');repo.addChunk(meeting.id,0,Buffer.from([0,0]));const segment={seq:0,startMs:0,endMs:100,text:'Anterior'};repo.saveTranscription(meeting.id,[segment],1,false);repo.saveSummary(meeting.id,document,'local');repo.setStatus(meeting.id,'transcribiendo');
    assert.throws(()=>repo.saveTranscription(meeting.id,[{...segment,text:'Nuevo'},segment],2,true));assert.equal(repo.get(meeting.id).status,'transcribiendo');assert.equal(repo.get(meeting.id).summaryStatus,'ready');assert.equal(repo.detail(meeting.id).segments[0].text,'Anterior');
    repo.saveTranscription(meeting.id,[{...segment,text:'Nuevo'}],2,true);assert.equal(repo.get(meeting.id).status,'listo');assert.equal(repo.get(meeting.id).summaryStatus,'queued');assert.equal(repo.detail(meeting.id).segments[0].text,'Nuevo');assert.deepEqual(repo.detail(meeting.id).summary?.document,document);
  }finally{repo.close();rmSync(p.directory,{recursive:true,force:true});}
});
test('summary failure keeps the last summary and transcription',()=>{
  const p=profile(),repo=new MeetingsRepository(p.path);
  try{const meeting=repo.create('Resumen');repo.saveTranscription(meeting.id,[{seq:0,startMs:0,endMs:100,text:'Evidencia'}],1,false);repo.saveSummary(meeting.id,document,'local');repo.setSummaryStatus(meeting.id,'error','Ollama no disponible');assert.equal(repo.get(meeting.id).status,'listo');assert.deepEqual(repo.detail(meeting.id).summary?.document,document);assert.equal(repo.detail(meeting.id).segments[0].text,'Evidencia');}
  finally{repo.close();rmSync(p.directory,{recursive:true,force:true});}
});
test('restart recovers capture and interrupted AI jobs, and deletion cascades all owned data',()=>{
  const p=profile(),repo=new MeetingsRepository(p.path);
  try{const recording=repo.create('Captura'),working=repo.create('Trabajo'),summary=repo.create('Resumen');repo.addChunk(working.id,0,Buffer.from([0,0]));repo.setStatus(working.id,'transcribiendo');repo.saveTranscription(summary.id,[{seq:0,startMs:0,endMs:100,text:'Texto'}],1,false);repo.saveSummary(summary.id,document,'local');repo.setSummaryStatus(summary.id,'running');repo.recover();assert.equal(repo.get(recording.id).status,'interrumpida');assert.equal(repo.get(working.id).status,'en_cola');assert.equal(repo.get(summary.id).summaryStatus,'queued');repo.remove(summary.id);
    for(const table of ['meeting_audio_chunks','meeting_segments','meeting_summaries'])assert.equal(repo.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE meeting_id=?`).get(summary.id)!.count,0);
  }finally{repo.close();rmSync(p.directory,{recursive:true,force:true});}
});
