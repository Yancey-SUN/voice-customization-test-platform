import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonEvents, voiceIntent } from './voice.ts';
test('SSE retains coalesced events, split UTF-8 and final unterminated line',async()=>{
 const bytes=new TextEncoder().encode('data: {"text":"你好"}\r\n\r\ndata: {"text":"two"}\n\ndata: {"text":"last"}');
 const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(bytes.slice(0,18));c.enqueue(bytes.slice(18,26));c.enqueue(bytes.slice(26));c.close();}});
 const events=[];for await(const event of jsonEvents(stream))events.push(event);
 assert.deepEqual(events,[{text:'你好'},{text:'two'},{text:'last'}]);
});
test('voice commands accept natural wording and distinguish confirmation',()=>{
 assert.equal(voiceIntent('可以换成温柔的男声吗'),'design');
 assert.equal(voiceIntent('我希望你的声音温暖一点'),'design');
 assert.equal(voiceIntent('就用这个声音'),'confirm');
 assert.equal(voiceIntent('今天我听到了鸟的声音'),'chat');
});
