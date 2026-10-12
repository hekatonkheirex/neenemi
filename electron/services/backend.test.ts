import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Backend } from './backend';
import { MeetingsRepository } from './repository';
function profile(){const directory=mkdtempSync(join(tmpdir(),'neenemi-backend-test-'));return{directory,options:{dataDirectory:join(directory,'data'),toolsDirectory:join(directory,'tools'),settingsPath:join(directory,'settings.json')}};}
test('unexpected close during capture preserves acknowledged PCM as an interrupted recording',async()=>{
  const p=profile(),backend=new Backend(p.options,()=>{});await backend.initialize();
  try{await backend.execute({method:'start',params:{title:'Conservado'}});const id=backend.repository.list()[0].id;await backend.execute({method:'appendAudio',params:{id,seq:0,data:new Uint8Array([1,0,2,0]).buffer}});await backend.close();
    const recovered=new MeetingsRepository(join(p.options.dataDirectory,'neenemi.sqlite'));try{assert.equal(recovered.get(id).status,'interrumpida');assert.equal(recovered.get(id).chunkCount,1);}finally{recovered.close();}
  }finally{rmSync(p.directory,{recursive:true,force:true});}
});
test('closing just after stop leaves the processing job durable rather than failed or discarded',async()=>{
  const p=profile(),backend=new Backend(p.options,()=>{});await backend.initialize();
  try{await backend.execute({method:'start',params:{title:'Pendiente'}});const id=backend.repository.list()[0].id;await backend.execute({method:'appendAudio',params:{id,seq:0,data:new Uint8Array([1,0]).buffer}});await backend.execute({method:'stop',params:undefined});await backend.close();
    const recovered=new MeetingsRepository(join(p.options.dataDirectory,'neenemi.sqlite'));try{assert.equal(recovered.get(id).status,'en_cola');assert.equal(recovered.get(id).chunkCount,1);}finally{recovered.close();}
  }finally{rmSync(p.directory,{recursive:true,force:true});}
});
