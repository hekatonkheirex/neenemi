declare const sampleRate:number;
declare class AudioWorkletProcessor { readonly port:MessagePort; constructor(); }
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
class PcmCapture extends AudioWorkletProcessor {
  private buffer=new Int16Array(480000);
  private used=0;
  private stopped=false;
  constructor(){
    super();
    this.port.onmessage=event=>{
      if(event.data==='stop'){
        this.stopped=true;
        if(this.used){const data=this.buffer.buffer.slice(0,this.used*2);this.port.postMessage({kind:'chunk',data},[data]);}
        this.used=0;this.port.postMessage({kind:'stopped'});
      }
    };
    if(sampleRate!==16000)throw new Error('La captura requiere PCM de 16 kHz.');
  }
  process(inputs:Float32Array[][]):boolean{
    if(this.stopped)return false;
    const channels=inputs[0];if(!channels?.length)return true;
    for(let i=0;i<channels[0].length;i++){
      let mono=0;for(const channel of channels)mono+=channel[i];mono/=channels.length;
      const value=Math.max(-1,Math.min(1,mono));this.buffer[this.used++]=Math.round(value<0?value*32768:value*32767);
      if(this.used===this.buffer.length){const data=this.buffer.buffer;this.port.postMessage({kind:'chunk',data},[data]);this.buffer=new Int16Array(480000);this.used=0;}
    }
    return true;
  }
}
registerProcessor('pcm-capture',PcmCapture);
