import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Sparkles, 
  Zap, 
  Clock, 
  Cpu, 
  Key, 
  AlertTriangle, 
  RefreshCw, 
  ShieldAlert, 
  Database,
  Layers,
  ChevronDown,
  Info
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function generateSessionId() {
  return 's-' + Math.random().toString(36).substring(2, 8) + Date.now().toString(36).substring(4);
}

export default function App() {
  // Session initialization: "A new session starts on each page load"
  const [sessionId] = useState(() => generateSessionId());
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful, concise AI assistant.');
  const [isLoading, setIsLoading] = useState(false);
  
  // Health & Gateway status
  const [healthStatus, setHealthStatus] = useState(null);
  
  // Failover test simulation header selection
  const [simulateFailure, setSimulateFailure] = useState('');
  const [customSimulate, setCustomSimulate] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Check health on mount
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (res.ok) {
          const data = await res.json();
          setHealthStatus(data);
        } else {
          setHealthStatus({ status: 'error', detail: `HTTP ${res.status}` });
        }
      } catch (err) {
        setHealthStatus({ status: 'offline', detail: 'Backend unreachable' });
      }
    };
    fetchHealth();
  }, []);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    // "Empty after sending"
    setInputValue('');

    // Append user message immediately to UI
    const userMsg = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const headers = {
        'Content-Type': 'application/json',
      };

      const activeSim = simulateFailure === 'custom' ? customSimulate : simulateFailure;
      if (activeSim.trim()) {
        headers['X-Simulate-Failure'] = activeSim.trim();
      }

      const bodyPayload = {
        session_id: sessionId,
        message: trimmed,
      };

      if (systemPrompt.trim()) {
        bodyPayload.system_prompt = systemPrompt.trim();
      }

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(bodyPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        // PDF: "Errors (422, 503) show as a readable message in the chat, never a blank screen."
        const errorDetail = data?.detail 
          ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
          : `HTTP ${response.status} Error`;

        setMessages((prev) => [
          ...prev,
          {
            role: 'error',
            status: response.status,
            content: `Error (${response.status}): ${errorDetail}`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      } else {
        // Successful assistant response conforming to API contract
        const assistantMsg = {
          role: 'assistant',
          content: data.reply,
          metadata: data.metadata,
          timestamp: new Date().toLocaleTimeString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'error',
          status: 'NETWORK_ERROR',
          content: `Network connection failed: Unable to connect to backend at ${API_BASE_URL}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-bold text-lg">
            <Sparkles className="w-5 h-5 text-sky-100" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-lg tracking-tight text-white">Lyftr AI Gateway</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-950 text-sky-400 border border-sky-800/60 font-mono">
                v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">Resilient LLM with Automatic Key Failover & In-Memory Response Caching</p>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
            <span className="text-slate-400">Session:</span>
            <span className="font-mono text-sky-300 font-semibold">{sessionId}</span>
          </div>

          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
            <span className={`w-2 h-2 rounded-full ${healthStatus?.status === 'ok' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            <span className="text-slate-300 font-medium">
              {healthStatus?.status === 'ok' ? 'Online' : 'Degraded'}
            </span>
            {healthStatus?.keys_configured !== undefined && (
              <span className="text-slate-400 border-l border-slate-700 pl-2">
                Keys: <strong className="text-slate-200">{healthStatus.keys_configured}</strong>
              </span>
            )}
            {healthStatus?.cache_enabled && (
              <span className="text-emerald-400 border-l border-slate-700 pl-2">
                Cache: <strong>Active</strong>
              </span>
            )}
          </div>

          <button
            onClick={() => setShowConfig(!showConfig)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors flex items-center space-x-1"
          >
            <span>Controls</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showConfig ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </header>

      {/* Control Panel Bar (Expandable) */}
      {showConfig && (
        <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs animate-in slide-in-from-top-2">
          {/* System Prompt Input */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center space-x-1.5">
              <span>System Prompt (Session Override)</span>
            </label>
            <input
              data-testid="system-prompt-input"
              type="text"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="e.g. You are a helpful, concise AI assistant."
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 focus:border-sky-500 focus:outline-none text-slate-200"
            />
          </div>

          {/* Failover Test Hook */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center space-x-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Simulate Failure Hook (X-Simulate-Failure)</span>
            </label>
            <div className="flex space-x-2">
              <select
                value={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:border-sky-500 focus:outline-none flex-1"
              >
                <option value="">None (Normal Live Operation)</option>
                <option value="key_1=429">key_1=429 (Trigger Failover to key_2)</option>
                <option value="key_1=500">key_1=500 (Trigger Failover to key_2)</option>
                <option value="*=429">*=429 (Force All Fail - Expected 503)</option>
                <option value="custom">Custom Simulation Header...</option>
              </select>

              {simulateFailure === 'custom' && (
                <input
                  type="text"
                  placeholder="key_1=429,key_2=500"
                  value={customSimulate}
                  onChange={(e) => setCustomSimulate(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 w-48 font-mono"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Chat Conversation Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4 opacity-80">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Sparkles className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">How can I help you today?</h2>
              <p className="text-sm text-slate-400">
                Send a message to test multi-turn conversation, automatic key failover, and LiteLLM response caching.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full pt-4 text-left">
              <button
                onClick={() => {
                  setInputValue('What is the capital of France?');
                  inputRef.current?.focus();
                }}
                className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-xs text-slate-300 transition-colors"
              >
                <p className="font-semibold text-sky-400 mb-1">Test Caching</p>
                <p className="text-slate-400">"What is the capital of France?"</p>
              </button>
              <button
                onClick={() => {
                  setSimulateFailure('key_1=429');
                  setShowConfig(true);
                  setInputValue('Hello from key failover test!');
                  inputRef.current?.focus();
                }}
                className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-xs text-slate-300 transition-colors"
              >
                <p className="font-semibold text-amber-400 mb-1">Test Failover</p>
                <p className="text-slate-400">Set key_1=429 and send message</p>
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            if (msg.role === 'user') {
              return (
                <div key={idx} className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-xl rounded-2xl rounded-tr-sm px-4 py-3 bg-sky-600 text-white shadow-md">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <span className="block text-[10px] text-sky-200 mt-1 text-right">{msg.timestamp}</span>
                  </div>
                </div>
              );
            }

            if (msg.role === 'error') {
              return (
                <div key={idx} className="flex justify-start">
                  <div className="max-w-[85%] sm:max-w-xl rounded-2xl rounded-tl-sm px-4 py-3 bg-rose-950/60 border border-rose-800/60 text-rose-200 shadow-md">
                    <div className="flex items-center space-x-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span className="font-semibold text-xs text-rose-300">
                        {msg.status === 503 ? 'All Providers Unavailable (503)' : `Service Notice (${msg.status})`}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    <span className="block text-[10px] text-rose-400 mt-1">{msg.timestamp}</span>
                  </div>
                </div>
              );
            }

            // Assistant Message Container
            // Must contain: data-testid="assistant-message"
            // and inner: meta-source, meta-model, meta-latency, meta-input-tokens, meta-output-tokens
            return (
              <div key={idx} className="flex justify-start">
                <div 
                  data-testid="assistant-message" 
                  className="max-w-[88%] sm:max-w-2xl rounded-2xl rounded-tl-sm px-5 py-4 bg-slate-900 border border-slate-800 text-slate-100 shadow-md space-y-3"
                >
                  {/* Reply Text */}
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-slate-200">
                    {msg.content}
                  </p>

                  {/* Metadata Element Requirements */}
                  {msg.metadata && (
                    <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
                      {/* Resolution Source: Exactly LIVE_INFERENCE or LLM_CACHE */}
                      <span
                        data-testid="meta-source"
                        className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-medium text-[11px] ${
                          msg.metadata.resolution_source === 'LLM_CACHE'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                            : 'bg-sky-950 text-sky-400 border border-sky-800/80'
                        }`}
                      >
                        {msg.metadata.resolution_source === 'LLM_CACHE' ? (
                          <Database className="w-3 h-3 mr-1" />
                        ) : (
                          <Zap className="w-3 h-3 mr-1" />
                        )}
                        {msg.metadata.resolution_source}
                      </span>

                      {/* Model Used */}
                      <span
                        data-testid="meta-model"
                        className="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 font-mono text-[11px]"
                      >
                        <Cpu className="w-3 h-3 mr-1 text-slate-400" />
                        {msg.metadata.model}
                      </span>

                      {/* Latency */}
                      <span
                        data-testid="meta-latency"
                        className="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 font-mono text-[11px]"
                      >
                        <Clock className="w-3 h-3 mr-1 text-slate-400" />
                        {msg.metadata.latency_ms} ms
                      </span>

                      {/* Input Tokens */}
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 font-mono text-[11px]">
                        <span className="text-slate-400 mr-1">In:</span>
                        <span data-testid="meta-input-tokens" className="font-semibold text-slate-200">
                          {msg.metadata.input_tokens}
                        </span>
                      </span>

                      {/* Output Tokens */}
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 font-mono text-[11px]">
                        <span className="text-slate-400 mr-1">Out:</span>
                        <span data-testid="meta-output-tokens" className="font-semibold text-slate-200">
                          {msg.metadata.output_tokens}
                        </span>
                      </span>

                      {/* Key Id & Fallback Attempts (Extra metadata helpful for evaluation) */}
                      {msg.metadata.key_id && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/40 font-mono text-[11px]">
                          <Key className="w-3 h-3 mr-1 text-amber-400" />
                          {msg.metadata.key_id}
                          {msg.metadata.fallback_attempts > 0 && (
                            <span className="ml-1 text-amber-400 font-semibold">
                              (after {msg.metadata.fallback_attempts} fallback{msg.metadata.fallback_attempts > 1 ? 's' : ''})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-slate-900 border border-slate-800 flex items-center space-x-2 text-slate-400 text-xs">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
              <span>Generating response via LiteLLM gateway...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Bottom Message Input Bar */}
      <footer className="border-t border-slate-800 bg-slate-900/90 p-4 shrink-0">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center space-x-3">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              data-testid="chat-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question... (Enter to send)"
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 text-sm shadow-inner"
              disabled={isLoading}
            />
          </div>

          <button
            data-testid="send-button"
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:hover:bg-sky-600 text-white font-medium text-sm flex items-center space-x-1.5 shadow-md shadow-sky-600/20 transition-all shrink-0"
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-[11px] text-center text-slate-500 mt-2">
          Multi-turn session {sessionId} &bull; Per-request token tracking enabled
        </p>
      </footer>
    </div>
  );
}
