'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, Check, ChevronRight, CircleHelp, Copy, Headphones, Menu, MessageCircle, Mic, Plus, Settings2, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { jsonEvents, voiceIntent, type Voice } from '@/lib/voice';
type Message={id:string;role:'user'|'assistant';text:string;preview?:string};
type Conversation={id:string;title:string;messages:Message[]};
type Candidate=Voice&{audio:string;format:string};
const fresh=():Conversation=>({id:crypto.randomUUID(),title:'新的对话',messages:[]});
async function post(path:string,body:unknown,signal?:AbortSignal) {
  const r=await fetch(`/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if(!r.ok){const e=await r.json().catch(()=>({error:'网络异常，请重试'})) as {error?:string};throw new Error(e.error||'请求失败');}return r;
}
export default function Home(){
  const [conversations,setConversations]=useState<Conversation[]>([]),[active,setActive]=useState('');
  const [input,setInput]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[panel,setPanel]=useState<'voice'|'settings'|null>(null);
  const [voice,setVoice]=useState<Voice|null>(null),[candidate,setCandidate]=useState<Candidate|null>(null),[description,setDescription]=useState('');
  const [persona,setPersona]=useState('温暖、有耐心、真诚，愿意倾听，也会给出自己的看法。');
  const [sound,setSound]=useState(true),[listening,setListening]=useState(false),[mobile,setMobile]=useState(false),[notice,setNotice]=useState('');
  const [ready,setReady]=useState<boolean|null>(null),[hydrated,setHydrated]=useState(false);
  const [playing,setPlaying]=useState(false),[candidateUrl,setCandidateUrl]=useState('');
  const audio=useRef<HTMLAudioElement|null>(null),abort=useRef<AbortController|null>(null),recognition=useRef<any>(null),bottom=useRef<HTMLDivElement|null>(null);
  const messageAudio=useRef(new Map<string,string>()),urls=useRef<string[]>([]);
  const messages=conversations.find(c=>c.id===active)?.messages||[];
  useEffect(()=>{
    try{const saved=JSON.parse(localStorage.getItem('omi-sites-v1')||'null');
      if(saved&&Array.isArray(saved.conversations)&&saved.conversations.length){setConversations(saved.conversations);setActive(saved.conversations[0].id);setVoice(saved.voice||null);setPersona(saved.persona||'温暖、有耐心、真诚。');setSound(saved.sound!==false);}
      else{const c=fresh();setConversations([c]);setActive(c.id);}
    }catch{const c=fresh();setConversations([c]);setActive(c.id);}setHydrated(true);
    fetch('/api/status').then(r=>r.json()).then(d=>setReady(Boolean((d as {ready?:boolean}).ready))).catch(()=>{setReady(false);setError('暂时无法连接服务，请刷新重试');});
    return()=>{abort.current?.abort();recognition.current?.abort();audio.current?.pause();urls.current.forEach(URL.revokeObjectURL);};
  },[]);
  useEffect(()=>{if(hydrated)try{localStorage.setItem('omi-sites-v1',JSON.stringify({conversations:conversations.map(c=>({...c,messages:c.messages.slice(-100).map(({preview,...m})=>m)})),voice,persona,sound}));}catch{setError('浏览器存储空间不足，部分记录可能无法保存');}},[conversations,voice,persona,sound,hydrated]);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'});},[messages.length,busy,messages.at(-1)?.text]);
  const update=(id:string,fn:(m:Message[])=>Message[])=>setConversations(cs=>cs.map(c=>c.id===id?{...c,messages:fn(c.messages)}:c));
  const append=(id:string,role:Message['role'],text:string,extra:Partial<Message>={})=>{const m={id:crypto.randomUUID(),role,text,...extra};update(id,ms=>[...ms,m]);return m.id;};
  const url=(blob:Blob)=>{const result=URL.createObjectURL(blob);urls.current.push(result);return result;};
  const play=async(src:string)=>{audio.current?.pause();const a=new Audio(src);audio.current=a;a.onended=()=>setPlaying(false);a.onerror=()=>{setPlaying(false);setError('音频播放失败，请重新试听');};try{await a.play();setPlaying(true);}catch{setPlaying(false);setError('浏览器未允许自动播放，请点击播放按钮。');}};
  const speak=async(message:Message,selected:Voice|null,signal?:AbortSignal)=>{
    const cacheKey=message.id+':'+(selected?.id||'default');const cached=messageAudio.current.get(cacheKey);if(cached){await play(cached);return;}
    const r=await post('tts',{text:message.text.slice(0,4000),voice:selected},signal);const src=url(await r.blob());messageAudio.current.set(cacheKey,src);if(!signal?.aborted)await play(src);
  };
  const confirm=()=>{if(!candidate){setNotice('请先描述想要的声音，生成一段试听。');setPanel('voice');return;}setVoice({id:candidate.id,model:candidate.model,description:candidate.description});append(active,'assistant','好的，以后我会使用你确认的这个声音。');setCandidate(null);setCandidateUrl('');setPanel(null);setNotice('已保存声线，在此浏览器中后续对话将使用它。');};
  const design=async(prompt:string,id=active)=>{
    if(!prompt.trim()||busy)return;setBusy('正在设计声音…');setError('');const controller=new AbortController();abort.current=controller;
    try{const r=await post('voice',{prompt},controller.signal);const result:Candidate=await r.json();const bytes=Uint8Array.from(atob(result.audio),c=>c.charCodeAt(0));const src=url(new Blob([bytes],{type:result.format==='wav'?'audio/wav':'audio/mpeg'}));setCandidate(result);setCandidateUrl(src);setPanel('voice');append(id,'assistant','这是一段新声线的试听。满意的话，点击“确认使用”，或告诉我“就用这个声音”。',{preview:src});await play(src);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'声音设计失败');}finally{setBusy('');abort.current=null;}
  };
  const send=async(value=input)=>{
    const valueText=value.trim();if(!valueText||busy||!active)return;setInput('');setError('');setNotice('');audio.current?.pause();setPlaying(false);
    const id=active;append(id,'user',valueText);setConversations(cs=>cs.map(c=>c.id===id&&c.title==='新的对话'?{...c,title:valueText.slice(0,22)}:c));
    const intent=voiceIntent(valueText);if(intent==='confirm'){confirm();return;}if(intent==='design'){setDescription(valueText);await design(valueText,id);return;}
    setBusy('Omi 正在思考…');const controller=new AbortController();abort.current=controller;let answer='',messageId='';
    try{const r=await post('chat',{text:valueText,history:messages.slice(-16),persona},controller.signal);if(!r.body)throw new Error('服务未返回内容');
      messageId=append(id,'assistant','');for await(const event of jsonEvents(r.body)){if(event.error)throw new Error(event.error);if(event.delta){answer+=event.delta;update(id,ms=>ms.map(m=>m.id===messageId?{...m,text:answer}:m));}}
      if(!answer)throw new Error('没有收到回复，请重试');if(sound){setBusy('正在生成语音…');await speak({id:messageId,role:'assistant',text:answer},voice,controller.signal);}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'请求失败');if(messageId&&!answer)update(id,ms=>ms.filter(m=>m.id!==messageId));}
    finally{setBusy('');abort.current=null;}
  };
  const startMic=()=>{
    if(listening){recognition.current?.stop();return;}
    const Speech=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!Speech){setError('这个浏览器不支持语音输入，请使用 Chrome，或输入文字。');return;}
    audio.current?.pause();setPlaying(false);const r=new Speech();recognition.current=r;r.lang='zh-CN';r.interimResults=true;r.continuous=false;let final='';
    r.onresult=(e:any)=>{let full='';for(let i=0;i<e.results.length;i++)full+=e.results[i][0].transcript;setInput(full);if(e.results[e.results.length-1].isFinal)final=full;};
    r.onerror=(e:any)=>{setListening(false);if(e.error!=='aborted')setError(e.error==='not-allowed'?'请允许麦克风访问，然后再试。':'语音识别未成功，请重试或输入文字。');};
    r.onend=()=>{setListening(false);if(final)void send(final);};try{r.start();setListening(true);setError('');}catch{setError('麦克风启动失败，请重试');}
  };
  const newChat=()=>{if(busy)return;const c=fresh();setConversations(cs=>[c,...cs].slice(0,20));setActive(c.id);setMobile(false);setError('');setInput('');};
  const replay=async(m:Message)=>{setError('');if(m.preview){await play(m.preview);return;}setBusy('正在生成语音…');const c=new AbortController();abort.current=c;try{await speak(m,voice,c.signal);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'播放失败');}finally{setBusy('');abort.current=null;}};
  return <div className="app-shell">
    <aside className={mobile?'sidebar open':'sidebar'}><div className="brand">omi<span>thought to action</span><button className="mobile-only icon" aria-label="关闭菜单" onClick={()=>setMobile(false)}><X size={20}/></button></div>
      <button className="new-chat" disabled={!!busy} onClick={newChat}><Plus size={18}/> 新的对话</button><div className="section-label">你的对话</div><nav>{conversations.map(c=><button disabled={!!busy} key={c.id} className={c.id===active?'chat-link selected':'chat-link'} onClick={()=>{setActive(c.id);setMobile(false);setError('');}}><MessageCircle size={17}/><span>{c.title}</span></button>)}</nav>
      <div className="sidebar-bottom"><button onClick={()=>setPanel('voice')}><AudioLines size={18}/> 我的声音 <ChevronRight size={15}/></button><button onClick={()=>setPanel('settings')}><Settings2 size={18}/> 伙伴设置</button><div className="visitor"><div className="avatar">你</div><div>访客体验<small>记录仅保存在当前浏览器</small></div><span className="dot"/></div></div>
    </aside>{mobile&&<button className="scrim" aria-label="关闭菜单" onClick={()=>setMobile(false)}/>}
    <main><header><div className="heading"><button className="mobile-only icon" aria-label="打开菜单" onClick={()=>setMobile(true)}><Menu size={20}/></button><strong>Chat with Omi</strong><span className="demo-badge">VOICE DEMO</span></div><div className="header-actions"><button className="icon" aria-label={sound?'关闭自动语音':'开启自动语音'} onClick={()=>{setSound(!sound);if(sound){audio.current?.pause();setPlaying(false);}}}>{sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button><button className="share" onClick={async()=>{try{await navigator.clipboard.writeText(location.origin);setNotice('分享链接已复制');}catch{setNotice(`分享这个网址：${location.origin}`);}}}><Copy size={15}/>分享</button></div></header>
      <div className="conversation-scroll">{messages.length===0?<div className="welcome"><div className="orb"><div/><span/></div><p className="eyebrow">A LITTLE MORE HUMAN</p><h1>我在，慢慢说。</h1><p className="intro">一个愿意听你说话的伙伴。<br/>聊聊今天，也可以为我选一个你喜欢的声音。</p><div className="starters"><button onClick={()=>setInput('今天有点累，想找你聊聊。')}><MessageCircle size={19}/><span>聊聊今天<small>开心或疲惫，都可以</small></span><ChevronRight size={16}/></button><button onClick={()=>setPanel('voice')}><AudioLines size={19}/><span>设计我的声音<small>用文字描述你喜欢的声线</small></span><ChevronRight size={16}/></button></div></div>:<div className="messages">{messages.map(m=><article key={m.id} className={`message ${m.role}`}><div className="message-avatar">{m.role==='assistant'?'o':'你'}</div><div className="message-body"><div className="speaker">{m.role==='assistant'?'Omi':'你'}</div><div className="message-text">{m.text||'…'}</div>{m.role==='assistant'&&m.text&&<button className="replay" disabled={!!busy} onClick={()=>replay(m)}><Volume2 size={14}/>{m.preview?'播放试听':'播放'}</button>}</div></article>)}</div>}<div ref={bottom}/></div>
      <div className="composer-area">{ready===false&&<div className="setup-note"><CircleHelp size={17}/><span>页面已就绪，模型服务尚未配置完成。请创建者配置服务端密钥后发布。</span></div>}{error&&<div className="alert" role="alert"><span>{error}</span><button aria-label="关闭提示" onClick={()=>setError('')}><X size={16}/></button></div>}{notice&&<div className="notice" role="status">{notice}</div>}
        <div className="voice-strip"><button onClick={()=>setPanel('voice')}><AudioLines size={14}/>{voice?'自定义声线':'默认声线'}<ChevronRight size={13}/></button><span>{busy||(listening?'正在听你说…':playing?'Omi 正在说话…':'')}{playing&&<button aria-label="停止播放" onClick={()=>{audio.current?.pause();setPlaying(false);}}><Square size={12}/></button>}</span></div>
        <form className={listening?'composer recording':'composer'} onSubmit={e=>{e.preventDefault();void send();}}><textarea aria-label="给 Omi 发消息" placeholder="给 Omi 发消息，或说出你想要的声音…" value={input} maxLength={4000} rows={2} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><div className="composer-tools"><span>Enter 发送 · Shift + Enter 换行</span><div><button type="button" className={listening?'icon active':'icon'} disabled={!!busy} aria-label={listening?'停止录音':'语音输入'} onClick={startMic}><Mic size={20}/></button>{busy?<button className="send" type="button" aria-label="停止生成" onClick={()=>abort.current?.abort()}><Square size={16}/></button>:<button className="send" disabled={!input.trim()||!hydrated||listening} aria-label="发送消息"><ArrowUp size={19}/></button>}</div></div></form><p className="footer-note">Omi 是 AI，回答可能有误。请勿在 Demo 中输入敏感信息。</p>
      </div>
    </main>
    {panel&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPanel(null);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="panel-title"><button className="close icon" aria-label="关闭" onClick={()=>setPanel(null)}><X size={20}/></button><div className="modal-symbol">{panel==='voice'?<AudioLines size={26}/>:<Settings2 size={26}/>}</div><h2 id="panel-title">{panel==='voice'?'让声音，更像你想象的我。':'你的 Omi，由你定义。'}</h2>
      {panel==='voice'?<><p className="muted">描述声音 → 试听 → 确认。确认后，后续回答将固定使用这个声线。</p><label>你希望我听起来是什么样？<textarea autoFocus maxLength={500} rows={4} value={description} onChange={e=>setDescription(e.target.value)} placeholder="例如：温和沉稳的成年男声，低音但不沙哑，像朋友聊天一样自然，语速稍慢。"/></label><div className="presets">{['温柔明亮的年轻女声，自然亲切','沉稳温和的成年男声，低音，稍慢'].map(s=><button key={s} onClick={()=>setDescription(s)}>{s.startsWith('温柔')?'温柔女声':'沉稳男声'}</button>)}</div><button className="primary" disabled={!!busy||!description.trim()} onClick={()=>design(description)}><Headphones size={17}/>{busy||'生成一段试听'}</button>{candidate&&<div className="candidate"><div><Check size={17}/> 候选声线已生成</div><p>{candidate.description}</p><audio controls src={candidateUrl}/><button className="primary" onClick={confirm}>确认使用这个声线</button></div>}<div className="current-voice"><span>当前声音</span><p>{voice?.description||'默认预制声线'}</p>{voice&&<button className="text-button" onClick={()=>{setVoice(null);setNotice('已恢复默认声音');}}>恢复默认声线</button>}</div><p className="small muted">音色 ID 保存在此浏览器。设计是否可用取决于服务端目标模型及其权限；失败时不会替换当前声线。</p></>:<><p className="muted">这些偏好只保存在你的浏览器里。</p><label>伙伴的人格与交流方式<textarea autoFocus rows={5} maxLength={800} value={persona} onChange={e=>setPersona(e.target.value)}/></label><label className="toggle-row">自动播放语音回复<input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/></label><p className="small muted">语音输入使用浏览器语音识别服务，推荐 Chrome。识别完成后会自动发送；每次说话请点击麦克风。</p><button className="primary" onClick={()=>setPanel(null)}>完成</button><button className="delete" disabled={!!busy} onClick={()=>{if(window.confirm('清空此浏览器的所有聊天记录？已确认声线会保留。')){const c=fresh();setConversations([c]);setActive(c.id);setPanel(null);}}}><Trash2 size={15}/>清空本地聊天记录</button></>}{error&&<p className="modal-error" role="alert">{error}</p>}</section></div>}
  </div>;
}
