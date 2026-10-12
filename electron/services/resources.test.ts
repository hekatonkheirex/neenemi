import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type RequestListener } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { downloadVerified } from './resources';
async function fixture(handler:RequestListener){
  const directory=mkdtempSync(join(tmpdir(),'neenemi-download-test-')),server=createServer(handler),ready=Promise.withResolvers<void>();
  server.once('error',ready.reject);server.listen(0,'127.0.0.1',ready.resolve);await ready.promise;
  const address=server.address();if(!address||typeof address==='string')throw new Error('No se abrió el servidor de prueba.');
  return{directory,url:`http://127.0.0.1:${address.port}/artifact`,async close(){server.closeAllConnections();const closed=Promise.withResolvers<void>();server.close(()=>closed.resolve());await closed.promise;rmSync(directory,{recursive:true,force:true});}};
}
test('downloads only replace an installed resource after verifying its SHA-256',async()=>{
  const body=Buffer.from('Recurso de prueba'),source=await fixture((_request,response)=>response.end(body));
  try{const path=join(source.directory,'engine'),old=Buffer.from('Recurso anterior');writeFileSync(path,old);
    await assert.rejects(downloadVerified(source.url,path,'0'.repeat(64),()=>{},new AbortController().signal));assert.deepEqual(readFileSync(path),old);assert.equal(existsSync(path+'.part'),false);
    await downloadVerified(source.url,path,createHash('sha256').update(body).digest('hex'),()=>{},new AbortController().signal);assert.deepEqual(readFileSync(path),body);assert.equal(existsSync(path+'.part'),false);
  }finally{await source.close();}
});
test('cancelling a live HTTP download removes its partial file without deleting the prior resource',async()=>{
  const source=await fixture((_request,response)=>{response.write(Buffer.alloc(2048,1));});
  try{const path=join(source.directory,'model'),old=Buffer.from('Modelo anterior');writeFileSync(path,old);const controller=new AbortController();
    await assert.rejects(downloadVerified(source.url,path,'0'.repeat(64),()=>controller.abort(),controller.signal));assert.equal(existsSync(path+'.part'),false);assert.deepEqual(readFileSync(path),old);
  }finally{await source.close();}
});
