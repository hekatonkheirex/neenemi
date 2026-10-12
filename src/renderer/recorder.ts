import pcmWorkletURL from './pcm-worklet.ts?worker&url';
import type { Meeting } from '../shared/contracts';
interface Session {
  id:string;stream:MediaStream;context:AudioContext;source:MediaStreamAudioSourceNode;node:AudioWorkletNode;
  writing:Promise<void>;seq:number;failure:Error|null;persistenceFailed:boolean;broken:boolean;stopping:boolean;
  flushed:PromiseWithResolvers<void>;
}
export class PcmRecorder {
  private session:Session|null=null;
  private starting:PromiseWithResolvers<void>|null=null;
  constructor(private readonly report:(message:string)=>void){}
  async start(title:string):Promise<Meeting>{
    if(this.session||this.starting)throw new Error('Ya hay una grabación en curso.');
    const starting=Promise.withResolvers<void>();this.starting=starting;
    let stream:MediaStream|undefined,context:AudioContext|undefined,created:Meeting|undefined;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,sampleRate:16000,echoCancellation:true,noiseSuppression:true},video:false});
      context=new AudioContext({sampleRate:16000});await context.audioWorklet.addModule(pcmWorkletURL);
      const node=new AudioWorkletNode(context,'pcm-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      const source=context.createMediaStreamSource(stream);created=await window.neenemi.call('start',{title});
      const session:Session={id:created.id,stream,context,source,node,writing:Promise.resolve(),seq:0,failure:null,persistenceFailed:false,broken:false,stopping:false,flushed:Promise.withResolvers<void>()};
      this.session=session;
      node.port.onmessage=event=>{
        if(event.data.kind==='chunk'){
          const data=event.data.data;
          session.writing=session.writing.then(async()=>{
            if(session.persistenceFailed)return;
            await window.neenemi.call('appendAudio',{id:session.id,seq:session.seq++,data});
          }).catch(error=>{session.persistenceFailed=true;session.failure=error instanceof Error?error:new Error(String(error));this.report('Falló el guardado del audio: '+session.failure.message);});
        }else if(event.data.kind==='stopped')session.flushed.resolve();
      };
      node.onprocessorerror=()=>{session.broken=true;session.failure=new Error('Falló la captura PCM. Puedes procesar el audio conservado.');this.report(session.failure.message);};
      for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>{if(!session.stopping){session.failure=new Error('El micrófono se desconectó. Termina la grabación para conservar el audio.');this.report(session.failure.message);}});
      source.connect(node);node.connect(context.destination);await context.resume();return created;
    }catch(error){
      for(const track of stream?.getTracks()??[])track.stop();await context?.close();this.session=null;
      if(created)await window.neenemi.call('abortRecording',{id:created.id,error:error instanceof Error?error.message:String(error)});
      throw error;
    }
    finally{starting.resolve();this.starting=null;}
  }
  async stop():Promise<void>{
    await this.starting?.promise;
    const session=this.session;if(!session)return;
    if(session.stopping)throw new Error('La grabación ya se está deteniendo.');
    session.stopping=true;session.source.disconnect();for(const track of session.stream.getTracks())track.stop();
    let timer:number|undefined;
    try{
      if(!session.broken){timer=window.setTimeout(()=>session.flushed.reject(new Error('La captura no entregó el último bloque. El audio conservado sigue disponible.')),10000);session.node.port.postMessage('stop');await session.flushed.promise;}
      await session.writing;
      if(session.failure)throw session.failure;
      await window.neenemi.call('stop',undefined);
    }catch(error){
      await window.neenemi.call('abortRecording',{id:session.id,error:error instanceof Error?error.message:String(error)});throw error;
    }finally{
      window.clearTimeout(timer);session.node.disconnect();session.node.port.close();await session.context.close();this.session=null;
    }
  }
}
