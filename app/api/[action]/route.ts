import { env } from 'cloudflare:workers';
import { audioDownloadUrl, boundedAudio } from '@/lib/tts-audio';

const vars = () => env as unknown as Record<string, string> & { DB?: D1Database };
function config() {
  const e = vars();
  const workspace = e.DASHSCOPE_WORKSPACE_ID || '';
  if (!/^(?:ws|llm)-[a-z0-9]+$/.test(workspace)) throw new Error('服务端业务空间配置无效');
  return { key: e.DASHSCOPE_API_KEY, host: `${workspace}.cn-beijing.maas.aliyuncs.com`,
    tts: e.QWEN_TTS_MODEL || 'qwen-audio-3.0-tts-plus', voice: e.QWEN_TTS_VOICE || 'longanlingxin',
    realtime: e.QWEN_REALTIME_MODEL || 'qwen3.5-omni-plus-realtime',
    design: e.QWEN_VOICE_DESIGN_TARGET_MODEL || e.QWEN_TTS_MODEL || 'qwen-audio-3.0-tts-plus',
    enrollment: e.QWEN_VOICE_DESIGN_MODEL || 'voice-enrollment' };
}
class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
function safe(message: unknown) {
  let value = String(message || '模型服务暂时不可用').slice(0, 1000);
  const key = vars().DASHSCOPE_API_KEY;
  if (key) value = value.split(key).join('[redacted]');
  return value.replace(/sk-[\w.\-]+/g, '[redacted]');
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function providerError(data: any) {
  return new RequestError(safe(data?.message || data?.error?.message || '模型未返回有效结果') +
    (data?.request_id ? `（请求 ${String(data.request_id).slice(0,100)}）` : ''), 502);
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new RequestError(`请输入 1–${max} 字以内的内容`);
  return value.trim();
}
async function limit(req: Request, action: string) {
  const db = vars().DB;
  if (!db) throw new RequestError('服务尚未完成初始化，请稍后再试', 503);
  const day = new Date().toISOString().slice(0,10);
  const raw = req.headers.get('cf-connecting-ip') || 'anonymous';
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(day + raw))))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  const design = action === 'voice';
  const reserve = async (key: string, max: number) => db.prepare('INSERT INTO usage (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count').bind(key,max).first();
  // A database-backed global ceiling remains effective across Worker isolates.
  const cap = Number(vars().DEMO_DAILY_LIMIT || 600);
  if (!Number.isFinite(cap) || cap < 1) throw new RequestError('Demo 暂停使用',503);
  if (!await reserve(`${day}:all:${design ? 'design':'chat'}`, design ? Math.min(cap,20) : cap)) throw new RequestError('今天的 Demo 体验额度已用完，请明天再试',429);
  if (!await reserve(`${day}:${hash}:${action}`,design ? 3 : 60)) throw new RequestError('今天的体验次数已用完，请明天再试',429);
  await db.prepare('DELETE FROM usage WHERE key < ?').bind(day).run();
}
export async function GET() {
  const c=config();
  return json({ ready: Boolean(c.key), model: c.tts, designModel: c.design });
}
export async function POST(req: Request, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    if (!['chat','tts','voice'].includes(action)) return json({ error: 'Not found' },404);
    const origin=req.headers.get('Origin');
    if (origin && origin !== new URL(req.url).origin) throw new RequestError('请从 Demo 页面发起请求',403);
    if (!req.headers.get('Content-Type')?.includes('application/json')) throw new RequestError('请求格式错误');
    // Bound before parsing, including requests without Content-Length.
    const reader=req.body?.getReader(); let size=0; let raw=''; const decoder=new TextDecoder();
    if (!reader) throw new RequestError('请求为空');
    while (true) { const r=await reader.read(); if (r.done) break; size+=r.value.byteLength;
      if (size>50000) { await reader.cancel(); throw new RequestError('输入过长',413); } raw+=decoder.decode(r.value,{stream:true}); }
    raw+=decoder.decode();
    let body; try { body=JSON.parse(raw); } catch { throw new RequestError('请求格式错误'); }
    const c=config();
    if (!c.key) throw new RequestError('站点尚未配置模型密钥，请站点创建者配置 DASHSCOPE_API_KEY 后发布。',503);
    const input=text(action==='voice'?body.prompt:body.text,action==='voice'?500:4000);
    await limit(req,action);
    if (action==='chat') return await chat(req,c,body,input);
    const headers={ Authorization:`Bearer ${c.key}`, 'Content-Type':'application/json' };
    if (action==='voice') {
      const response=await fetch(`https://${c.host}/api/v1/services/audio/tts/customization`,{
        method:'POST',headers,signal:AbortSignal.any([req.signal,AbortSignal.timeout(90000)]),
        body:JSON.stringify({model:c.enrollment,input:{action:'create_voice',target_model:c.design,
          voice_prompt:input,preview_text:'你好，很高兴认识你。慢慢说，我在这里听着。',prefix:'omi',language_hints:['zh']},
          parameters:{sample_rate:24000,response_format:'mp3'}})
      });
      const data:any=await response.json(); const output=data.output;
      if (!response.ok || !output?.voice_id || !output?.preview_audio?.data) throw providerError(data);
      return json({id:output.voice_id,model:output.target_model || c.design,description:input,
        audio:output.preview_audio.data,format:output.preview_audio.response_format || 'mp3'});
    }
    let model=c.tts, voice=c.voice;
    if (body.voice) {
      if (![c.tts,c.design].includes(body.voice.model) || typeof body.voice.id !== 'string' || !/^[a-zA-Z0-9_.-]{1,240}$/.test(body.voice.id)) throw new RequestError('已选音色与当前模型配置不匹配，请重新创建');
      model=body.voice.model; voice=body.voice.id;
    }
    const response=await fetch(`https://${c.host}/api/v1/services/audio/tts/SpeechSynthesizer`,{
      method:'POST',headers,
      signal:AbortSignal.any([req.signal,AbortSignal.timeout(90000)]),
      body:JSON.stringify({model,input:{text:input,voice,format:'mp3',sample_rate:24000}})
    });
    const result:any=await response.json().catch(()=>({message:`语音服务返回格式异常（HTTP ${response.status}）`}));
    if (!response.ok || result.code || !result.output?.audio) throw providerError(result);
    // Non-streaming synthesis returns a complete file URL, with audio.data empty.
    // Download the actual file instead of reporting the empty data field as a voice mismatch.
    const download=await fetch(audioDownloadUrl(result.output.audio.url),{
      redirect:'manual',signal:AbortSignal.any([req.signal,AbortSignal.timeout(30000)])
    });
    if(!download.ok || !download.body)throw new RequestError(`语音已生成，但下载失败（HTTP ${download.status}），请重试`,502);
    const bytes=await boundedAudio(download.body);
    return new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store'}});
  } catch(error) { return json({error:safe(error instanceof Error?error.message:error)},error instanceof RequestError?error.status:502); }
}
async function chat(req:Request,c:ReturnType<typeof config>,body:any,input:string) {
  const upstream=await fetch(`https://${c.host}/api-ws/v1/realtime?model=${encodeURIComponent(c.realtime)}`,{
    headers:{Upgrade:'websocket',Authorization:`Bearer ${c.key}`},signal:AbortSignal.any([req.signal,AbortSignal.timeout(20000)])});
  const socket=upstream.webSocket;
  if (!socket) throw new RequestError(`对话模型连接失败（HTTP ${upstream.status}），请检查权限和业务空间`,502);
  const history=Array.isArray(body.history)?body.history.slice(-16).filter((m:any)=>['user','assistant'].includes(m.role)&&typeof m.text==='string').map((m:any)=>`${m.role}: ${m.text.slice(0,3000)}`).join('\n').slice(-16000):'';
  const persona=typeof body.persona==='string'?body.persona.slice(0,800):'';
  const encoder=new TextEncoder();let stop:()=>void=()=>{};
  const stream=new ReadableStream<Uint8Array>({
    start(controller) {
      let closed=false,answer='',started=false;
      const emit=(event:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));};
      const done=()=>{if(closed)return;closed=true;clearTimeout(timer);req.signal.removeEventListener('abort',stop);try{socket.close(1000);}catch{}try{controller.close();}catch{}};
      stop=done;
      const timer=setTimeout(()=>{emit({error:'对话超时，请重试'});done();},90000);
      socket.addEventListener('message',(message)=>{
        try {
          const e=JSON.parse(String(message.data));
          if(e.type==='session.created') socket.send(JSON.stringify({type:'session.update',session:{modalities:['text'],instructions:`你是 Omi，一位自然、温暖、简洁的个人陪伴助手。用用户的语言回答，控制在500字内。${persona}。你不能直接创建音色或声称已经完成声线更改；如用户要求，提示使用页面“声音”功能。`}}));
          if(e.type==='session.updated'&&!started) {started=true;socket.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:`${history?`此前对话：\n${history}\n\n`:''}用户当前消息：${input}`} ]}}));socket.send(JSON.stringify({type:'response.create'}));}
          if(e.type==='response.text.delta') {answer+=e.delta||'';emit({delta:e.delta||''});if(answer.length>4000){emit({done:true});done();}}
          if(e.type==='response.text.done'&&!answer&&e.text){answer=e.text;emit({delta:e.text});}
          if(e.type==='response.done') {if(e.response?.status==='failed')emit({error:safe(e.response.status_details?.error?.message)});else if(!answer)emit({error:'对话模型未返回文本，请重试'});else emit({done:true});done();}
          if(e.type==='error'){emit({error:safe(e.error?.message)});done();}
        }catch{emit({error:'对话响应格式异常'});done();}
      });
      socket.addEventListener('error',()=>{emit({error:'模型连接中断，请重试'});done();});
      socket.addEventListener('close',()=>{if(!closed){emit({error:'模型提前断开连接，请重试'});done();}});
      req.signal.addEventListener('abort',stop,{once:true});socket.accept();
    },cancel(){stop();}
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store'}});
}
