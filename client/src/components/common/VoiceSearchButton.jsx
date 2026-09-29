import { Mic } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import useSpeechRecognition from '../../hooks/useSpeechRecognition';

/**
 * Tap-to-talk mic for search. Calls onResult(transcript) when speech is
 * recognised. Renders nothing on browsers without the Web Speech API.
 *
 * Props:
 *  - onResult(text): required, receives the spoken text
 *  - size: icon size (default 18)
 *  - className: extra classes on the outer button
 */
export default function VoiceSearchButton({ onResult, size = 18, className = '' }) {
  const { supported, listening, start, stop } = useSpeechRecognition({
    onResult: (text) => {
      toast.dismiss('voice-listening');
      // Voice often returns trailing punctuation / filler — clean it so the
      // catalog filter matches ("puncture." → "puncture").
      const cleaned = text.replace(/[.,!?;:]+$/g, '').replace(/\s+/g, ' ').trim();
      if (cleaned) onResult?.(cleaned);
    },
    onError: (err) => {
      toast.dismiss('voice-listening');
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        toast.error('Allow microphone access to use voice search');
      } else if (err !== 'aborted' && err !== 'no-speech') {
        toast.error('Voice search failed, try again');
      }
    },
  });

  if (!supported) return null;

  const toggle = () => {
    if (listening) { stop(); toast.dismiss('voice-listening'); return; }
    start();
    toast.loading('Listening… say a service', { id: 'voice-listening', duration: 6000 });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? 'Stop voice search' : 'Voice search'}
      aria-pressed={listening}
      className={`relative shrink-0 outline-none ${className}`}
    >
      {listening && (
        <motion.span
          className="absolute inset-0 rounded-lg bg-zappy-500/40"
          animate={{ scale: [1, 1.9], opacity: [0.6, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span
        className={`relative flex items-center justify-center rounded-lg w-9 h-9 transition-colors ${
          listening ? 'bg-zappy-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-navy'
        }`}
      >
        <Mic size={size} strokeWidth={2.2} />
      </span>
    </button>
  );
}
