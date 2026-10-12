import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import { z } from 'zod';
import { Backend, type ServiceRequest } from './services/backend';
if(!parentPort)throw new Error('Falta el puerto de servicios.');
const port:MessagePort=parentPort;
const options=z.object({dataDirectory:z.string(),toolsDirectory:z.string(),settingsPath:z.string()}).parse(workerData);
const backend=new Backend(options,event=>port.postMessage(event));
async function start(){
  await backend.initialize();
  port.on('message',async(request:ServiceRequest&{id:number})=>{
    try{const result=await backend.execute(request);port.postMessage({id:request.id,result});if(request.method==='shutdown')port.close();}
    catch(error){port.postMessage({id:request.id,error:error instanceof Error?error.message:String(error)});}
  });
}
void start().catch(error=>{throw error;});
