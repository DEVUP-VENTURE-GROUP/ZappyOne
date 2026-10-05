import { useState } from 'react';
import { Mic, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import useSpeechRecognition from '../../hooks/useSpeechRecognition';

const EXAMPLES = ['Bike puncture', 'Phone screen broken', 'Car battery dead', 'Dog grooming'];

/** What went wrong with the mic, in words that say what to do next. */
const ERRORS = {
  'not-allowed': 'Allow the microphone for ZappyOne in your browser settings, then try again.',
  'service-not-allowed': 'Allow the microphone for ZappyOne in your browser settings, then try again.',
  'no-speech': 'We did not hear anything. Tap the mic and say what you need.',
  'audio-capture': 'No microphone found. You can type instead.',
  network: 'Voice needs an internet connection. You can type instead.',
};

/**
 * Tap-to-talk search. Opens a listening screen that shows the words as they
 * are spoken, then hands the sentence to search. On browsers without voice
 * (some iPhones and Firefox) the mic stays visible and says so when tapped.
 *
 *  - onResult(text): receives what was said
 */
export default function VoiceSearchButton({ onResult, size = 18, className = '' }) {
  const [heard, setHeard] = useState('');
  const { supported, listening, start, stop } = useSpeechRecognition({
    onInterim: setHeard,
    onResult: (text) => {
      // Spoken text often ends with punctuation; search wants the words.
      const cleaned = text.replace(/[.,!?;:]+$/g, '').replace(/\s+/g, ' ').trim();
      setHeard(cleaned);
      if (cleaned) onResult?.(cleaned);
    },
    onError: (err) => {
      if (err !== 'aborted') toast.error(ERRORS[err] || 'Voice did not work this time. Try again or type instead.');
    },
  });

  function tap() {
    if (!supported) { toast('Voice search is not available in this browser. Type what you need instead.'); return; }
    if (listening) { stop(); return; }
    setHeard('');
    start();
  }

  return (
    <>
      <button type="button" onClick={tap} aria-label={listening ? 'Stop voice search' : 'Search by voice'} aria-pressed={listening}
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 hover:text-navy ${className}`}>
        <Mic size={size} strokeWidth={2.2} />
      </button>

      <AnimatePresence>
        {listening && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[260] flex items-end justify-center bg-ink-900/50 sm:items-center"
            role="dialog" aria-modal="true" aria-label="Listening">
            <motion.div initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 30 }} transition={{ duration: 0.2 }}
              className="w-full max-w-md rounded-t-sheet bg-white px-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-6 text-center sm:rounded-sheet">
              <div className="flex justify-end">
                <button type="button" onClick={stop} aria-label="Stop listening" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-sunken"><X size={18} /></button>
              </div>
              <span className="relative mx-auto flex h-20 w-20 items-center justify-center">
                <motion.span className="absolute inset-0 rounded-full bg-zappy-600/25"
                  animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }} />
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-zappy-600 text-white"><Mic size={26} /></span>
              </span>
              <p className="mt-4 min-h-[56px] text-[20px] font-semibold leading-snug text-ink-900" aria-live="polite">
                {heard || 'Listening…'}
              </p>
              {!heard && (
                <div className="mt-3">
                  <p className="text-[13px] text-ink-500">Say what needs fixing, for example</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                    {EXAMPLES.map((e) => <span key={e} className="rounded-full bg-sunken px-3 py-1 text-[13px] text-ink-700">“{e}”</span>)}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
