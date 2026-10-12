import { Worker } from 'node:worker_threads';
import type { CoreEvent, Method, Params, Results } from '../src/shared/contracts';
import type { ServiceOptions } from './services/settings';
export class ServiceClient {
  private readonly worker:Worker;
  private readonly exited:Promise<void>;
  private nextId=0;
  private failure:Error|null=null;
  private intentional=false;
  private readonly pending=new Map<number,{resolve(value:unknown):void;reject(error:Error):void}>();
  constructor(path:string,options:ServiceOptions,private readonly onEvent:(event:CoreEvent)=>void){
    this.worker=new Worker(path,{workerData:options});
    const exit=Promise.withResolvers<void>();this.exited=exit.promise;
    this.worker.once('exit',code=>{if(!this.intentional||this.pending.size)this.fail(new Error(`Los servicios locales se cerraron (${code}).`));exit.resolve();});
    this.worker.once('error',error=>this.fail(error));
    this.worker.on('message',response=>{
      if(response.event){this.onEvent(response);return;}
      const entry=this.pending.get(response.id);if(!entry)return;this.pending.delete(response.id);
      if(typeof response.error==='string')entry.reject(new Error(response.error));else entry.resolve(response.result);
    });
  }
  private fail(error:Error):void{
    if(this.failure)return;this.failure=error;
    for(const entry of this.pending.values())entry.reject(error);this.pending.clear();this.onEvent({event:'fatal',message:error.message});
  }
  call<K extends Method>(method:K,params:Params[K]):Promise<Results[K]>{
    if(this.failure)return Promise.reject(this.failure);
    const id=++this.nextId,request=Promise.withResolvers<Results[K]>();
    this.pending.set(id,{resolve:value=>request.resolve(value as Results[K]),reject:request.reject});
    if(method==='appendAudio'&&params&&'data' in params)this.worker.postMessage({id,method,params},[params.data]);
    else this.worker.postMessage({id,method,params});return request.promise;
  }
  async close():Promise<void>{
    this.intentional=true;
    if(!this.failure){try{await this.call('shutdown',undefined);}catch(error){await this.worker.terminate();throw error;}}
    else await this.worker.terminate();
    await this.exited;
  }
}
