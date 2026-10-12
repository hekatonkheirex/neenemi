import { z } from 'zod';
import type { Method } from '../src/shared/contracts';
import { settingsSchema } from './services/settings';
const id=z.string().regex(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,'Identificador inválido.');
const byId=z.object({id}).strict();
const publicMethods:Record<string,z.ZodType>={
  state:z.nullish(z.undefined()),stop:z.nullish(z.undefined()),cancelPreparation:z.nullish(z.undefined()),
  detail:byId,process:byId,retry:byId,summary:byId,cancel:byId,delete:byId,
  start:z.object({title:z.string().trim().min(1,'Escribe un nombre.').max(300,'El nombre admite hasta 300 caracteres.')} ).strict(),
  settings:settingsSchema.strict(),prepare:z.object({summary:z.boolean(),ollamaModel:settingsSchema.shape.ollamaModel}).strict(),
  appendAudio:z.object({id,seq:z.number().int().nonnegative(),data:z.instanceof(ArrayBuffer).refine(data=>data.byteLength>0&&data.byteLength<=960000&&data.byteLength%2===0,'Bloque PCM inválido.')} ).strict(),
  abortRecording:z.object({id,error:z.string().min(1).max(4000)}).strict()
};
export function validateCall(method:unknown,params:unknown):asserts method is Method{
  if(typeof method!=='string'||!Object.hasOwn(publicMethods,method))throw new Error('Operación no permitida.');
  publicMethods[method].parse(params);
}
export function validateId(value:unknown):asserts value is string{id.parse(value);}
