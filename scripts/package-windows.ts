import { mkdir, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import { build, Platform, Arch } from 'electron-builder';
import { ensureWhisper } from '../electron/services/resources';
const controller=new AbortController();
process.once('SIGINT',()=>controller.abort());
async function packageWindows(){
  await ensureWhisper(resolve('build/resources'),console.log,controller.signal);
  const directory=resolve('build/installer-dependencies');await mkdir(directory,{recursive:true});
  const path=resolve(directory,'vc_redist.x64.exe');
  try{
    const response=await fetch('https://aka.ms/vs/17/release/vc_redist.x64.exe',{signal:controller.signal});
    if(!response.ok||!response.body)throw new Error('No se pudo descargar el redistribuible oficial Visual C++.');
    const body=response.body as Parameters<typeof Readable.fromWeb>[0];
    await pipeline(Readable.fromWeb(body),createWriteStream(path+'.part'),{signal:controller.signal});await rename(path+'.part',path);
  }finally{await rm(path+'.part',{force:true});}
  controller.signal.throwIfAborted();
  const files=await build({targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),publish:'never'});
  console.log('Paquetes generados sin publicar:',files);
}
void packageWindows().catch(error=>{console.error(error);process.exitCode=1;});
