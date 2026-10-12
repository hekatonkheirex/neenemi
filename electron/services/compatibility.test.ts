import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MeetingsRepository } from './repository';
import { loadSettings, saveSettings } from './settings';
test('former C# settings migrate to the TS contract without retaining backend paths',()=>{
  const directory=mkdtempSync(join(tmpdir(),'neenemi-settings-test-'));
  try{const path=join(directory,'settings.json');writeFileSync(path,JSON.stringify({OllamaModel:'qwen3:1.7b',CpuThreads:2,ContextTokens:16384,AutoSummarize:false,ToolsDirectory:'old-host/resources',DataDirectory:'old-directory'}));
    const settings=loadSettings(path);assert.deepEqual(settings,{ollamaModel:'qwen3:1.7b',cpuThreads:2,contextTokens:16384,autoSummarize:false});saveSettings(path,settings);assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),settings);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('recovered PCM respects its stored sample rate rather than assuming a new capture rate',()=>{
  const directory=mkdtempSync(join(tmpdir(),'neenemi-rate-test-')),repo=new MeetingsRepository(join(directory,'data.sqlite'));
  try{const meeting=repo.create('PCM histórico');repo.addChunk(meeting.id,0,Buffer.alloc(32000));repo.db.prepare('UPDATE meetings SET sample_rate=8000 WHERE id=?').run(meeting.id);repo.setStatus(meeting.id,'interrumpida');repo.finish(meeting.id);assert.equal(repo.get(meeting.id).durationS,2);
    const path=join(directory,'audio.wav');repo.writeAudio(meeting.id,path);assert.equal(readFileSync(path).readUInt32LE(24),8000);
  }finally{repo.close();rmSync(directory,{recursive:true,force:true});}
});
test('malformed stored summaries are rejected at the service boundary without mutating saved transcription',()=>{
  const directory=mkdtempSync(join(tmpdir(),'neenemi-summary-test-')),repo=new MeetingsRepository(join(directory,'data.sqlite'));
  try{const meeting=repo.create('Texto conservado');repo.saveTranscription(meeting.id,[{seq:0,startMs:0,endMs:100,text:'Evidencia conservada'}],1,false);repo.saveSummary(meeting.id,{overview:'Resumen',topics:[],decisions:[],actions:[]},'local');repo.db.prepare('UPDATE meeting_summaries SET document=? WHERE meeting_id=?').run('{"overview":"incompleto"}',meeting.id);
    assert.throws(()=>repo.detail(meeting.id));assert.equal(repo.get(meeting.id).status,'listo');assert.equal(repo.db.prepare('SELECT text FROM meeting_segments WHERE meeting_id=?').get(meeting.id)!.text,'Evidencia conservada');
  }finally{repo.close();rmSync(directory,{recursive:true,force:true});}
});
