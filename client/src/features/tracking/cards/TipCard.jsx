/**
 * Voice Tip Card — shown after service completion.
 * Customer records a 10-second voice thank-you + picks tip amount.
 * Completely unique in India. Emotional, viral, human.
 */
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, Gift, Loader2, CheckCircle2 } from 'lucide-react';
import { useSendTipMutation, usePresignUploadMutation } from '@shared/services/api';
import toast from 'react-hot-toast';

const DEFAULT_TIP_OPTIONS_RS = [20, 50, 100, 200];

export default function TipCard({ orderId, onDone, tipOptions, tipMax }) {
  const presets = (tipOptions ?? DEFAULT_TIP_OPTIONS_RS)
    .filter(n => typeof n === 'number' && n > 0 && (!tipMax || n <= tipMax))
    .map(n => ({ paise: n * 100, label: `₹${n}` }));
  const [selected,   setSelected]   = useState(null);
  const [recording,  setRecording]  = useState(false);
  const [audioBlob,  setAudioBlob]  = useState(null);
  const [audioUrl,   setAudioUrl]   = useState(null);
  const [sent,       setSent]       = useState(false);
  const [message,    setMessage]    = useState('');
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const [sendTip,      { isLoading: sending }]   = useSendTipMutation();
  const [presignUpload, { isLoading: uploading }] = usePresignUploadMutation();

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      /* Auto-stop at 10s */
      setTimeout(() => { if (mr.state === 'recording') mr.stop(); setRecording(false); }, 10000);
    } catch {
      toast.error('Microphone not available');
    }
  }

  function stopRecording() {
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
    setRecording(false);
  }

  async function handleSend() {
    if (!selected) { toast.error('Pick a tip amount'); return; }

    let voiceNoteUrl = null;

    /* Upload voice note if recorded */
    if (audioBlob) {
      try {
        const file = new File([audioBlob], 'voice-tip.webm', { type: 'audio/webm' });
        const { uploadUrl, key } = await presignUpload({
          folder: 'voice-tips',
          contentType: file.type,
        }).unwrap();
        await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        voiceNoteUrl = key;
      } catch { /* proceed without voice note */ }
    }

    try {
      await sendTip({ orderId, amountPaise: selected, voiceNoteUrl, message }).unwrap();
      setSent(true);
      toast.success('Tip sent! Worker will love this 💝');
      setTimeout(() => onDone?.(), 2000);
    } catch (err) {
      toast.error(err.data?.error || 'Could not send tip');
    }
  }

  if (sent) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card bg-green-50 ring-1 ring-green-100 flex flex-col items-center gap-3 py-6"
      >
        <CheckCircle2 size={32} className="text-green-500" />
        <p className="font-bold text-green-800">Tip sent!</p>
        <p className="text-xs text-green-600 text-center">Worker will receive your message 💝</p>
      </motion.div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-pink-50 flex items-center justify-center">
          <Gift size={15} strokeWidth={2} className="text-pink-500" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#0F172A]">Send a Tip + Thank You</p>
          <p className="text-[11px] text-slate-400">100% goes to the worker</p>
        </div>
      </div>

      {/* Tip amount */}
      <div className="flex gap-2">
        {presets.map(p => (
          <button
            key={p.paise}
            onClick={() => setSelected(p.paise)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${
              selected === p.paise
                ? 'bg-pink-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:ring-pink-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Voice note recorder */}
      <div>
        <p className="text-[11px] text-slate-400 mb-2 font-medium">Optional: Record a voice thank-you (10 sec)</p>
        {!audioUrl ? (
          <button
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition ${
              recording
                ? 'bg-red-50 ring-2 ring-red-400 text-red-600 animate-pulse'
                : 'bg-slate-50 ring-1 ring-slate-200 text-slate-600'
            }`}
          >
            {recording ? <MicOff size={15} /> : <Mic size={15} />}
            {recording ? 'Recording… Release to stop' : 'Hold to record voice note'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <audio src={audioUrl} controls className="flex-1 h-8 rounded-lg" />
            <button onClick={() => { setAudioBlob(null); setAudioUrl(null); }} className="text-xs text-red-500">redo</button>
          </div>
        )}
      </div>

      <button
        onClick={handleSend}
        disabled={sending || uploading || !selected}
        className="w-full py-3 rounded-xl bg-pink-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-pink-100"
      >
        {sending || uploading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        {sending || uploading ? 'Sending…' : `Send Tip${selected ? ` ₹${selected / 100}` : ''}${audioUrl ? ' + Voice' : ''}`}
      </button>
    </div>
  );
}
