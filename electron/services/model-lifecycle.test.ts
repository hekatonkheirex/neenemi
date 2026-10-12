import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http, { type RequestListener, type RequestOptions, type IncomingMessage } from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { summarize, ModelReleaseError } from './summarizer';
const settings={ollamaModel:'qwen3:4b',cpuThreads:2,contextTokens:8192,autoSummarize:true};
const segments=[{seq:0,startMs:0,endMs:1000,text:'Se acordó conservar el audio.'}];
async function transport(context:TestContext,handler:RequestListener){
  const server=http.createServer(handler),ready=Promise.withResolvers<void>();server.once('error',ready.reject);server.listen(0,'127.0.0.1',ready.resolve);await ready.promise;
  const address=server.address();if(!address||typeof address==='string')throw new Error('Falta el servidor de prueba.');
  const original=http.request;
  context.mock.method(http,'request',(options:RequestOptions,callback?:(response:IncomingMessage)=>void)=>original({...options,port:address.port},callback));
  syncBuiltinESMExports();
  return{async close(){context.mock.restoreAll();syncBuiltinESMExports();server.closeAllConnections();const closed=Promise.withResolvers<void>();server.close(()=>closed.resolve());await closed.promise;}};
}
test('failure before Ollama responds remains a request failure, not an outstanding model release',async context=>{
  const server=await transport(context,(request,response)=>{if(request.url==='/api/chat')request.socket.destroy();else{response.statusCode=503;response.end('No model exists');}});
  try{await assert.rejects(summarize(segments,settings,new AbortController().signal),error=>error instanceof Error&&'code' in error&&error.code==='ECONNRESET'&&!(error instanceof ModelReleaseError));}
  finally{await server.close();}
});
test('release failure after a completed model response retains the exact model requiring cleanup',async context=>{
  const server=await transport(context,(request,response)=>{
    if(request.url==='/api/chat')response.end(JSON.stringify({done:true,message:{content:JSON.stringify({overview:'Acuerdo',topics:[{text:'Conservar audio',sources:[0]}],decisions:[],actions:[]})}}));
    else request.socket.destroy();
  });
  try{await assert.rejects(summarize(segments,settings,new AbortController().signal),error=>error instanceof ModelReleaseError&&error.model==='qwen3:4b');}
  finally{await server.close();}
});
