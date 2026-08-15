import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { easeSoft } from '../../lib/animations';

/**
 * Disclosure list for service FAQs.
 *
 * Native `<button>` + `aria-expanded` + `aria-controls` rather than a details
 * element, because the open/close needs to animate its height and stay in sync
 * with a controlled "one open at a time" model.
 */
export default function ServiceFaqs({ faqs = [], title = 'Common questions' }) {
  const [open, setOpen] = useState(0);

  if (!faqs.length) return null;

  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-[17px] font-black tracking-tight text-navy-900">{title}</h2>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-[22px] border border-slate-200/70 bg-white">
        {faqs.map((faq, i) => {
          const expanded = open === i;
          return (
            <div key={faq.q}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? -1 : i)}
                aria-expanded={expanded}
                aria-controls={`faq-panel-${i}`}
                id={`faq-trigger-${i}`}
                className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--cat-accent)] sm:px-5"
              >
                <span className="text-[14px] font-bold text-navy-900">{faq.q}</span>
                <ChevronDown
                  size={17}
                  strokeWidth={2.6}
                  className={`shrink-0 text-slate-400 transition-transform duration-300 motion-reduce:transition-none ${
                    expanded ? 'rotate-180 text-[var(--cat-accent)]' : ''
                  }`}
                />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key="panel"
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${i}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: easeSoft }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-4 text-[13.5px] font-medium leading-relaxed text-slate-600 sm:px-5">
                      {faq.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
