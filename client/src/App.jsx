import { useState, useRef, useEffect, useCallback } from 'react';
import { createThread, streamRun } from './langgraph';
import './index.css';

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const BotIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/>
    <path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>
  </svg>
);
const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const SpinnerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);
const TypingDots = () => (
  <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', marginLeft: 6, verticalAlign: 'middle' }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{
        width: 4, height: 4, borderRadius: '50%', background: 'var(--agent)',
        display: 'inline-block',
        animation: `dotPulse 1.2s ease-in-out ${i * 0.18}s infinite`,
      }} />
    ))}
  </span>
);

function Message({ msg }) {
  const isUser = msg.role === 'user';
  const isError = msg.role === 'error';
  return (
    <div style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      gap: 10, alignItems: 'flex-start', animation: 'slideUp 0.25s ease',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser ? 'var(--bg-4)' : isError ? 'rgba(239,68,68,0.15)' : 'var(--agent-glow)',
        border: `1px solid ${isUser ? 'var(--border)' : isError ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.25)'}`,
        color: isUser ? 'var(--text-dim)' : isError ? 'var(--error)' : 'var(--agent)', marginTop: 2,
      }}>
        {isUser ? <UserIcon /> : <BotIcon />}
      </div>
      <div style={{
        maxWidth: '72%', padding: '10px 14px',
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        background: isUser
          ? 'linear-gradient(135deg, var(--accent) 0%, #6d28d9 100%)'
          : isError ? 'rgba(239,68,68,0.08)' : 'var(--bg-3)',
        border: `1px solid ${isUser ? 'transparent' : isError ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
        color: isUser ? 'rgba(255,255,255,0.95)' : isError ? 'var(--error)' : 'var(--text)',
        fontFamily: 'var(--font-mono)', fontSize: 13.5, lineHeight: 1.65,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        boxShadow: isUser ? '0 4px 20px rgba(139,92,246,0.25)' : '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        {msg.content}
        {msg.streaming && <TypingDots />}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    idle:       { dot: 'var(--agent)',    text: 'var(--text-dimmer)' },
    connecting: { dot: 'var(--accent-2)', text: 'var(--text-dimmer)' },
    streaming:  { dot: 'var(--agent)',    text: 'var(--agent)' },
    error:      { dot: 'var(--error)',    text: 'var(--error)' },
  };
  const c = colors[status] || colors.idle;
  const labels = { idle: 'Ready', connecting: 'Connecting…', streaming: 'Generating…', error: 'Error' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0,
        boxShadow: status === 'streaming' ? `0 0 8px ${c.dot}` : 'none',
        animation: status === 'streaming' ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }}/>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: c.text, letterSpacing: '0.05em' }}>
        {labels[status]}
      </span>
    </div>
  );
}

export default function App() {
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState({});
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const activeMessages = activeThread ? (messages[activeThread] || []) : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  const addMessage = useCallback((threadId, msg) => {
    setMessages(prev => ({ ...prev, [threadId]: [...(prev[threadId] || []), msg] }));
  }, []);

  const updateLastMessage = useCallback((threadId, updater) => {
    setMessages(prev => {
      const msgs = prev[threadId] || [];
      if (!msgs.length) return prev;
      const updated = [...msgs];
      updated[updated.length - 1] = updater(updated[updated.length - 1]);
      return { ...prev, [threadId]: updated };
    });
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || status === 'streaming' || status === 'connecting') return;

    let threadId = activeThread;
    if (!threadId) {
      setStatus('connecting');
      try {
        const id = await createThread();
        setActiveThread(id);
        setMessages({ [id]: [] });
        threadId = id;
      } catch (e) {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
        return;
      }
    }

    setInput('');
    addMessage(threadId, { role: 'user', content: text, id: Date.now() });
    addMessage(threadId, { role: 'assistant', content: '', id: Date.now() + 1, streaming: true });
    setStatus('streaming');

    await streamRun({
      threadId, message: text,
      onChunk: (chunk) => {
        updateLastMessage(threadId, msg => ({ ...msg, content: msg.content + chunk }));
      },
      onDone: () => {
        updateLastMessage(threadId, msg => ({ ...msg, streaming: false }));
        setStatus('idle');
      },
      onError: (err) => {
        updateLastMessage(threadId, msg => ({
          ...msg, role: 'error', content: `Error: ${err.message}`, streaming: false,
        }));
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      },
    });
  }, [input, status, activeThread, addMessage, updateLastMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dotPulse { 0%,80%,100%{opacity:0.2;transform:scale(0.75)} 40%{opacity:1;transform:scale(1)} }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .spinner { animation: spin 0.8s linear infinite; display:flex; }
        .send-btn:hover:not(:disabled) { background: var(--accent-2) !important; transform: scale(1.05); }
        .send-btn:disabled { opacity:0.4; cursor:not-allowed; }
        textarea { resize:none; }
        textarea:focus { outline:none; }
        .input-wrap:focus-within { border-color: var(--border-active) !important; box-shadow: 0 0 0 3px var(--accent-glow) !important; }
      `}</style>

      <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>

        {/* Main */}
        <main style={{
          flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg)',
          backgroundImage:`
            radial-gradient(ellipse 60% 40% at 70% 10%, rgba(139,92,246,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 40% 30% at 30% 90%, rgba(16,185,129,0.04) 0%, transparent 60%)
          `,
        }}>
          <header style={{
            padding:'14px 24px', borderBottom:'1px solid var(--border)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <div style={{ fontWeight:800, fontSize:15, letterSpacing:'-0.02em' }}>◈ Aegis Agent</div>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <StatusBadge status={status} />
              <div style={{
                fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-dimmer)',
                background:'var(--bg-3)', padding:'4px 10px', borderRadius:20, border:'1px solid var(--border)',
              }}>
                graph: agent
              </div>
            </div>
          </header>

          <div style={{ flex:1, overflowY:'auto', padding:'24px', display:'flex', flexDirection:'column', gap:18 }}>
            {activeMessages.length === 0 && (
              <div style={{ margin:'auto', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
                <div style={{
                  width:56, height:56, borderRadius:'50%', background:'var(--agent-glow)',
                  border:'1px solid rgba(16,185,129,0.2)', display:'flex', alignItems:'center',
                  justifyContent:'center', color:'var(--agent)', fontSize:24,
                }}>◈</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:18, marginBottom:6 }}>
                    {activeThread ? 'Thread ready' : 'Aegis Agent'}
                  </div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-dimmer)', lineHeight:1.7 }}>
                    {activeThread
                      ? 'Send a message to start talking to your agent.'
                      : 'Create a new thread or type a message to begin.'}
                  </div>
                </div>
              </div>
            )}
            {activeMessages.map((msg, i) => <Message key={msg.id ?? i} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding:'16px 24px 20px', borderTop:'1px solid var(--border)' }}>
            <div className="input-wrap" style={{
              display:'flex', gap:10, alignItems:'flex-end',
              background:'var(--bg-2)', border:'1px solid var(--border)',
              borderRadius:20, padding:'10px 10px 10px 16px', transition:'all 0.2s',
            }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message the agent… (Enter to send, Shift+Enter for newline)"
                rows={1}
                style={{
                  flex:1, background:'transparent', border:'none',
                  color:'var(--text)', fontFamily:'var(--font-mono)',
                  fontSize:13.5, lineHeight:1.6, overflowY:'auto', caretColor:'var(--accent)',
                }}
              />
              <button
                className="send-btn"
                onClick={send}
                disabled={!input.trim() || status === 'streaming' || status === 'connecting'}
                style={{
                  width:36, height:36, borderRadius:10, border:'none',
                  background:'var(--accent)', color:'white',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'pointer', flexShrink:0, transition:'all 0.15s',
                }}
              >
                {(status === 'streaming' || status === 'connecting')
                  ? <span className="spinner"><SpinnerIcon /></span>
                  : <SendIcon />}
              </button>
            </div>
            <div style={{
              marginTop:8, fontFamily:'var(--font-mono)', fontSize:10,
              color:'var(--text-dimmer)', textAlign:'center',
            }}>
              Connected to LangGraph dev server · Streaming enabled
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
