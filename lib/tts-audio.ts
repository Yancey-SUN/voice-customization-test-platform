// Provider audio URLs are fetched server-side without the API authorization header.
export function audioDownloadUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('语音服务未提供音频下载地址');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
      !/^dashscope-result-[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname)) {
    throw new Error('语音服务返回了不支持的音频下载地址');
  }
  url.protocol = 'https:';
  return url.href;
}
export async function boundedAudio(body: ReadableStream<Uint8Array>, max = 12_000_000): Promise<Uint8Array<ArrayBuffer>> {
  const reader=body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try { while(true) { const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>max)throw new Error('音频过长，请缩短回复');chunks.push(value);
  }} finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
  if(!size)throw new Error('语音文件为空，请重试');
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
