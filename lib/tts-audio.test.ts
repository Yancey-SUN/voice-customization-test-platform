import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioDownloadUrl, boundedAudio } from './tts-audio.ts';
test('official result URL is upgraded to HTTPS without changing signature',()=>{
 assert.equal(audioDownloadUrl('http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/pre/audio.mp3?Signature=a%2Bb'),'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/pre/audio.mp3?Signature=a%2Bb');
 for(const url of ['http://127.0.0.1/x','https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.test/x','https://user:pass@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/x'])assert.throws(()=>audioDownloadUrl(url));
});
test('complete audio download preserves all chunks and enforces size limit',async()=>{
 const stream=()=>new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3]));c.close();}});
 assert.deepEqual(await boundedAudio(stream()),new Uint8Array([1,2,3]));
 await assert.rejects(boundedAudio(stream(),2),/音频过长/);
});
