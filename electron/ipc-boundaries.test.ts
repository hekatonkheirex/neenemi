import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCall } from './validation';
test('renderer cannot access arbitrary import paths, raw playback files, process shutdown or prototype names',()=>{
  for(const method of ['import','shutdown','playback','markdown','__proto__','constructor'])assert.throws(()=>validateCall(method,{path:'/private/profile.sqlite'}));
});
test('capture boundary rejects oversized PCM, unaligned samples and invalid sequences',()=>{
  const id='12345678-1234-1234-1234-123456789abc';
  for(const params of [{id,seq:0,data:new ArrayBuffer(960002)},{id,seq:0,data:new ArrayBuffer(1)},{id,seq:-1,data:new ArrayBuffer(2)},{id,seq:0,data:'audio'},{id:'../../secret',seq:0,data:new ArrayBuffer(2)}])assert.throws(()=>validateCall('appendAudio',params));
});
test('settings and recording input cannot bypass model, memory, title or CPU boundaries',()=>{
  const settings={ollamaModel:'qwen3:4b',cpuThreads:4,contextTokens:8192,autoSummarize:true};
  for(const params of [{...settings,ollamaModel:'cloud'},{...settings,cpuThreads:1.5},{...settings,contextTokens:32769}])assert.throws(()=>validateCall('settings',params));
  assert.throws(()=>validateCall('start',{title:' '}));assert.throws(()=>validateCall('start',{title:'a'.repeat(301)}));
});
