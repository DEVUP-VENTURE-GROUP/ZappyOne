import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Send, Copy, Check, Sparkles, AlertTriangle, Info } from 'lucide-react';
import { ziAI } from './zi-api';

const AGENTS = [
  { id: 'coo', label: 'COO', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', desc: 'Operational intelligence, city performance, worker management' },
  { id: 'cfo', label: 'CFO', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', desc: 'Financial analysis, unit economics, burn rate, forecasts' },
  { id: 'cro', label: 'CRO', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30', desc: 'Growth strategy, retention, campaigns, expansion' },
  { id: 'strategy', label: 'Strategy', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', desc: 'Long-term planning, market analysis, competitive intelligence' },
];

const SUGGESTED = {
  coo: ["Why are cancellations up this week?", "Which city is underperforming?", "What's our SLA status?", "Show me worker availability by city"],
  cfo: ["What's our LTV:CAC ratio?", "Project next month's revenue", "What's our gross margin trend?", "Break down revenue by category"],
  cro: ["How do we reduce churn?", "Which user segments are growing fastest?", "Best campaign for worker retention?", "Expansion ROI by city"],
  strategy: ["What's our 12-month growth roadmap?", "Which new markets should we enter?", "How do we defend against competition?", "What's our product-market fit score?"],
};

const SEVERITY_ICON = { info: <Info size={14} />, warning: <AlertTriangle size={14} />, critical: <AlertTriangle size={14} /> };
const SEVERITY_COLOR = { info: 'bg-blue-500/10 border-blue-500/20 text-blue-300', warning: 'bg-amber-500/10 border-amber-500/20 text-amber-300', critical: 'bg-red-500/10 border-red-500/20 text-red-300' };

function MessageBubble({ msg }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';

  const copy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-indigo-600/40 flex items-center justify-center shrink-0 mt-0.5">
          <Brain size={14} className="text-indigo-300" />
        </div>
      )}
      <div className={`max-w-[80%] group relative ${isUser ? 'text-right' : ''}`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-slate-800 border border-slate-700/50 text-slate-200'
        }`}>
          {msg.content.split('\n').map((line, i) => (
            <p key={i} className={line.startsWith('•') || line.startsWith('-') ? 'ml-2' : ''}>{line || <br />}</p>
          ))}
        </div>
        {!isUser && (
          <button
            onClick={copy}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-slate-700 hover:bg-slate-600 transition-all"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-slate-400" />}
          </button>
        )}
        {msg.confidence && (
          <div className="text-[10px] text-slate-500 mt-1 ml-1">Confidence: {Math.round(msg.confidence * 100)}%</div>
        )}
      </div>
    </motion.div>
  );
}

export default function ZIAIAssistant() {
  const [agent, setAgent] = useState('coo');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [reportType, setReportType] = useState('');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    ziAI.getDailyInsights()
      .then(r => setInsights(r.data || []))
      .catch(() => setInsights([]))
      .finally(() => setInsightsLoading(false));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text) => {
    const question = text || input.trim();
    if (!question) return;

    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setInput('');
    setSending(true);

    try {
      const r = await ziAI.ask(question, agent);
      const answer = r.data?.answer || r.data?.content || r.data || 'No response';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2),
        confidence: r.data?.confidence,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setSending(false);
    }
  };

  const generateReport = async (type) => {
    setReportLoading(true);
    setReport(null);
    setReportType(type);
    try {
      const r = await ziAI.generateReport(type);
      setReport(r.data);
    } catch (e) {
      alert(e.message);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* Left: Agent selector */}
      <div className="w-52 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-white font-semibold text-sm">AI Executives</h2>
        </div>
        <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => { setAgent(a.id); setMessages([]); }}
              className={`w-full text-left p-3 rounded-xl transition-all border ${
                agent === a.id ? a.color + ' border-current' : 'border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <div className="font-semibold text-sm">{a.label}</div>
              <div className="text-[10px] mt-0.5 opacity-70 leading-tight">{a.desc}</div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-slate-800 space-y-1.5">
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-2">Reports</p>
          {['weekly_ops', 'monthly_investor', 'city_health'].map((t) => (
            <button
              key={t}
              onClick={() => generateReport(t)}
              disabled={reportLoading}
              className="w-full text-left px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Main: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <div className={`text-xs font-bold px-2.5 py-1 rounded-full border ${AGENTS.find(a => a.id === agent)?.color}`}>
            {AGENTS.find(a => a.id === agent)?.label} Agent
          </div>
          <span className="text-slate-500 text-xs">{AGENTS.find(a => a.id === agent)?.desc}</span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full space-y-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 flex items-center justify-center">
                <Brain size={28} className="text-indigo-400" />
              </div>
              <div>
                <p className="text-white font-semibold">Ask the {AGENTS.find(a => a.id === agent)?.label}</p>
                <p className="text-slate-400 text-sm mt-1">{AGENTS.find(a => a.id === agent)?.desc}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-w-md">
                {SUGGESTED[agent]?.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left px-3 py-2.5 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-xl text-slate-300 text-xs transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

          {sending && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/40 flex items-center justify-center shrink-0">
                <Brain size={14} className="text-indigo-300" />
              </div>
              <div className="bg-slate-800 border border-slate-700/50 rounded-2xl px-4 py-3">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full"
                      animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="flex gap-3 items-end">
            <textarea
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none min-h-[44px] max-h-[140px]"
              placeholder={`Ask the ${AGENTS.find(a => a.id === agent)?.label}...`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              rows={1}
            />
            <button
              onClick={() => sendMessage()}
              disabled={sending || !input.trim()}
              className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl transition-colors"
            >
              <Send size={16} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Insights */}
      <div className="w-64 shrink-0 border-l border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <Sparkles size={14} className="text-amber-400" />
          <h3 className="text-white text-sm font-semibold">Daily Insights</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {insightsLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse bg-slate-800 rounded-xl h-16" />
              ))
            : insights.length === 0
            ? <p className="text-slate-500 text-xs text-center py-8">No insights yet. Check back tomorrow.</p>
            : insights.map((ins, i) => (
                <div key={i} className={`p-3 rounded-xl border text-xs ${SEVERITY_COLOR[ins.severity] || SEVERITY_COLOR.info}`}>
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    {SEVERITY_ICON[ins.severity] || SEVERITY_ICON.info}
                    <span className="uppercase text-[10px] tracking-wider">{ins.severity}</span>
                  </div>
                  <p className="leading-relaxed opacity-90">{ins.insight}</p>
                  {ins.action && <p className="mt-1.5 font-semibold opacity-80">→ {ins.action}</p>}
                </div>
              ))
          }
        </div>

        {/* Report Preview */}
        {report && (
          <div className="border-t border-slate-800 p-3 max-h-64 overflow-y-auto">
            <h4 className="text-white text-xs font-bold mb-2">{report.title || reportType.replace(/_/g, ' ')}</h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">{report.executiveSummary}</p>
          </div>
        )}
        {reportLoading && (
          <div className="border-t border-slate-800 p-4 flex items-center gap-2 text-slate-400 text-xs">
            <motion.div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
            Generating report...
          </div>
        )}
      </div>
    </div>
  );
}
