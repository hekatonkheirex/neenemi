import { mkdtemp, rm, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import type { CoreEvent, Method, Params, Results, Settings } from '../../src/shared/contracts';
import { MeetingsRepository } from './repository';
import { loadSettings, saveSettings, settingsSchema, toolPaths, type ServiceOptions } from './settings';
import { ensureWhisper, hasWhisper } from './resources';
import { transcribe, runProcess } from './transcriber';
import { summarize, unloadModel, ModelReleaseError } from './summarizer';
import { markdown } from './markdown';
import { OllamaRuntime } from './ollama-runtime';
export type ServiceRequest = { [K in Method]: { method: K; params: Params[K] } }[Method];
interface Job { id:string; summary:boolean }
export class Backend {
  readonly repository: MeetingsRepository;
  private readonly ollama: OllamaRuntime;
  private settings: Settings;
  private recordingId: string|null=null;
  private queue: Job[]=[];
  private draining=Promise.resolve();
  private running=false;
  private closing=false;
  private pausing=false;
  private pendingUnloadModel:string|undefined;
  private active: { job:Job; abort:AbortController; done:Promise<void> }|undefined;
  private readonly deleting=new Set<string>();
  private preparation=Promise.resolve();
  private preparationAbort:AbortController|undefined;
  private playbackDirectory='';
  private readonly playback=new Map<string,{abort:AbortController;promise:Promise<string>}>();
  constructor(private readonly options:ServiceOptions,private readonly event:(event:CoreEvent)=>void) {
    this.settings=loadSettings(options.settingsPath);
    this.ollama=new OllamaRuntime(join(dirname(options.settingsPath),'runtime','ollama'));
    this.repository=new MeetingsRepository(join(options.dataDirectory,'neenemi.sqlite'));
    this.repository.recover();
  }
  async initialize():Promise<void> { this.playbackDirectory=await mkdtemp(join(tmpdir(),'neenemi-playback-')); this.resume(); }
  private changed():void { this.event({event:'changed'}); }
  private resume():void {
    for(const meeting of this.repository.list().reverse()) {
      if(meeting.status==='en_cola')this.enqueue({id:meeting.id,summary:false});
      if(meeting.status==='listo'&&meeting.summaryStatus==='queued')this.enqueue({id:meeting.id,summary:true});
    }
  }
  private enqueue(job:Job):void {
    if(this.closing||this.deleting.has(job.id)||this.queue.some(item=>item.id===job.id&&item.summary===job.summary)||(this.active?.job.id===job.id&&this.active.job.summary===job.summary))return;
    this.queue.push(job);
    if(!this.running&&!this.pausing){this.running=true;this.draining=this.drain().finally(()=>{this.running=false;});}
  }
  private async drain():Promise<void> {
    while(this.queue.length&&!this.closing&&!this.pausing){
      const job=this.queue.shift()!,abort=new AbortController(),done=Promise.withResolvers<void>();
      this.active={job,abort,done:done.promise};
      let directory:string|undefined;
      const settings=this.settings;
      try{
        const meeting=this.repository.get(job.id);
        if(job.summary ? meeting.summaryStatus!=='queued' : meeting.status!=='en_cola')continue;
        if(this.pendingUnloadModel){await this.ollama.ensureRunning(abort.signal);await unloadModel(this.pendingUnloadModel);this.pendingUnloadModel=undefined;}
        if(job.summary){
          this.repository.setSummaryStatus(job.id,'running');this.changed();
          await this.ollama.ensureRunning(abort.signal);
          const document=await summarize(this.repository.detail(job.id).segments,settings,abort.signal);
          this.pendingUnloadModel=undefined;abort.signal.throwIfAborted();this.repository.saveSummary(job.id,document,settings.ollamaModel);
        }else{
          this.repository.setStatus(job.id,'transcribiendo');this.changed();
          directory=await mkdtemp(join(tmpdir(),'neenemi-job-'));const audio=join(directory,'input.audio');this.repository.writeAudio(job.id,audio);
          const start=Date.now();
          const segments=await transcribe(audio,this.options.toolsDirectory,settings,value=>{if(!abort.signal.aborted){this.repository.setProgress(job.id,value);this.changed();}},abort.signal);
          abort.signal.throwIfAborted();this.repository.saveTranscription(job.id,segments,Math.round((Date.now()-start)/1000),settings.autoSummarize);
          if(settings.autoSummarize&&segments.length)this.enqueue({id:job.id,summary:true});
        }
      }catch(error){
        if(error instanceof ModelReleaseError)this.pendingUnloadModel=error.model;
        const preserve=this.closing||this.pausing;
        const message=abort.signal.aborted?'Procesamiento cancelado.':error instanceof Error?error.message:String(error);
        if(job.summary)this.repository.setSummaryStatus(job.id,preserve?'queued':'error',preserve?null:message);
        else this.repository.setStatus(job.id,preserve?'en_cola':'error',preserve?null:message);
      }finally{
        if(directory)await rm(directory,{recursive:true,force:true});
        this.active=undefined;done.resolve();this.changed();
      }
    }
  }
  private async cancel(id:string):Promise<void>{
    this.queue=this.queue.filter(job=>job.id!==id);
    if(this.active?.job.id===id){const active=this.active;active.abort.abort();await active.done;}
    const meeting=this.repository.get(id);
    if(meeting.status==='en_cola')this.repository.setStatus(id,'error','Transcripción cancelada.');
    if(meeting.summaryStatus==='queued')this.repository.setSummaryStatus(id,'error','Resumen cancelado.');this.changed();
  }
  private async clearPlayback(id?:string):Promise<void>{
    const entries=[...this.playback].filter(([key])=>id===undefined||key===id);
    for(const [,entry]of entries)entry.abort.abort();
    await Promise.allSettled(entries.map(([,entry])=>entry.promise));
    for(const [key]of entries){this.playback.delete(key);await rm(join(this.playbackDirectory,key+'.wav'),{force:true});}
  }
  private play(id:string):Promise<string>{
    if(this.closing||this.deleting.has(id)||id===this.recordingId)throw new Error('La grabación no está disponible para reproducir.');
    const cached=this.playback.get(id);if(cached)return cached.promise;
    const abort=new AbortController();
    const promise=(async()=>{
      const path=join(this.playbackDirectory,id+'.wav'),source=path+'.source',partial=path+'.partial.wav';
      try{
        if(existsSync(path))return path;
        this.repository.writeAudio(id,source);
        await runProcess(toolPaths(this.options.toolsDirectory).ffmpeg,['-y','-loglevel','error','-i',source,'-ar','16000','-ac','1','-c:a','pcm_s16le',partial],abort.signal);
        abort.signal.throwIfAborted();await rename(partial,path);return path;
      }finally{await rm(source,{force:true});await rm(partial,{force:true});}
    })();
    this.playback.set(id,{abort,promise});
    void promise.catch(()=>{if(this.playback.get(id)?.promise===promise)this.playback.delete(id);});return promise;
  }
  async execute(request:ServiceRequest):Promise<Results[Method]>{
    const {method,params:p}=request;
    if(this.closing&&method!=='shutdown')throw new Error('La aplicación se está cerrando.');
    switch(method){
      case 'state':return{meetings:this.repository.list(),recordingId:this.recordingId,settings:this.settings,dataDirectory:this.options.dataDirectory,hasWhisper:hasWhisper(this.options.toolsDirectory),preparing:!!this.preparationAbort};
      case 'detail':return this.repository.detail(p.id);
      case 'start':{
        if(this.recordingId||this.preparationAbort||this.pausing)throw new Error('Ya hay una grabación o preparación en curso.');
        const meeting=this.repository.create(p.title);this.recordingId=meeting.id;this.changed();return meeting;
      }
      case 'appendAudio':
        if(p.id!==this.recordingId)throw new Error('La grabación no está activa.');
        this.repository.addChunk(p.id,p.seq,new Uint8Array(p.data));return null;
      case 'stop':
        if(this.recordingId){const id=this.recordingId;this.repository.finish(id);this.recordingId=null;this.enqueue({id,summary:false});this.changed();}return null;
      case 'abortRecording':
        if(p.id!==this.recordingId)throw new Error('La grabación no está activa.');
        if(this.repository.get(p.id).chunkCount)this.repository.setStatus(p.id,'interrumpida',p.error);else this.repository.remove(p.id);
        this.recordingId=null;this.changed();return null;
      case 'process':this.repository.finish(p.id);this.enqueue({id:p.id,summary:false});this.changed();return null;
      case 'retry':this.repository.retry(p.id);this.enqueue({id:p.id,summary:false});this.changed();return null;
      case 'summary':{
        const detail=this.repository.detail(p.id);
        if(detail.meeting.status!=='listo'||!detail.segments.length)throw new Error('Necesitas una transcripción lista y con texto.');
        if(!['queued','running'].includes(detail.meeting.summaryStatus)){this.repository.setSummaryStatus(p.id,'queued');this.enqueue({id:p.id,summary:true});this.changed();}return null;
      }
      case 'cancel':await this.cancel(p.id);return null;
      case 'delete':
        if(p.id===this.recordingId)throw new Error('Termina la grabación antes de eliminarla.');
        this.deleting.add(p.id);
        try{await this.cancel(p.id);await this.clearPlayback(p.id);this.repository.remove(p.id);}finally{this.deleting.delete(p.id);}this.changed();return null;
      case 'playback':return this.play(p.id);
      case 'markdown':return markdown(this.repository.detail(p.id),p.summary);
      case 'import':{
        if(this.recordingId)throw new Error('Termina la grabación antes de importar.');
        const count=await this.repository.importFrom(p.path);this.resume();this.changed();return count;
      }
      case 'settings':{
        if(this.recordingId||this.preparationAbort||this.pausing)throw new Error('Termina la grabación o preparación antes de guardar.');
        const next=settingsSchema.parse(p);saveSettings(this.options.settingsPath,next);
        this.pausing=true;this.active?.abort.abort();await this.draining;await this.clearPlayback();
        this.settings=next;this.queue=[];this.pausing=false;this.resume();this.changed();return null;
      }
      case 'prepare':{
        if(this.recordingId||this.preparationAbort)throw new Error('Termina la grabación o preparación en curso.');
        if(!p.summary&&process.platform!=='win32')throw new Error('La descarga de motores precompilados es Windows; en Linux configura los motores locales.');
        const model=settingsSchema.shape.ollamaModel.parse(p.ollamaModel);
        this.preparationAbort=new AbortController();this.changed();const signal=this.preparationAbort.signal;
        this.preparation=(p.summary?this.ollama.prepare(model,message=>this.event({event:'preparation',message}),signal):ensureWhisper(this.options.toolsDirectory,message=>this.event({event:'preparation',message}),signal)).finally(()=>{this.preparationAbort=undefined;this.changed();});
        await this.preparation;return null;
      }
      case 'cancelPreparation':this.preparationAbort?.abort();return null;
      case 'shutdown':await this.close();return null;
    }
  }
  async close():Promise<void>{
    this.closing=true;this.preparationAbort?.abort();this.active?.abort.abort();
    if(this.recordingId){this.repository.setStatus(this.recordingId,'interrumpida');this.recordingId=null;}
    await this.draining;await this.preparation.catch(()=>{});await this.clearPlayback();
    await this.ollama.close();
    await rm(this.playbackDirectory,{recursive:true,force:true});this.repository.close();
  }
}
