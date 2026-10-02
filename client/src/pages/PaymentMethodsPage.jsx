import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard, Plus, Trash2, Star, ChevronLeft, X,
  Loader2, Smartphone, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetPaymentMethodsQuery,
  useAddPaymentMethodMutation,
  useDeletePaymentMethodMutation,
  useSetDefaultPaymentMethodMutation,
} from '@shared/services/api';
import PageTransition from '../components/common/PageTransition';

const NETWORK_COLORS = {
  Visa:       { bg: 'bg-blue-600',   label: 'VISA' },
  Mastercard: { bg: 'bg-red-600',    label: 'MC' },
  RuPay:      { bg: 'bg-orange-600', label: 'RuPay' },
  Amex:       { bg: 'bg-teal-600',   label: 'AMEX' },
  Diners:     { bg: 'bg-slate-600',  label: 'DC' },
  Unknown:    { bg: 'bg-slate-500',  label: '••' },
};

const UPI_ICONS = {
  gpay:    '🎯',
  phonepe: '💜',
  paytm:   '🔵',
  bhim:    '🇮🇳',
  other:   '📱',
};

function MethodCard({ method, onDelete, onSetDefault, deleting, settingDefault }) {
  const isCard = method.type === 'card';
  const isUpi  = method.type === 'upi';
  const net    = NETWORK_COLORS[method.network] || NETWORK_COLORS.Unknown;

  return (
    <motion.div
      className={`bg-white rounded-2xl ring-1 overflow-hidden ${method.isDefault ? 'ring-blue-200' : 'ring-slate-100'}`}
      style={{ boxShadow: method.isDefault ? '0 4px 16px rgba(37,99,235,0.1)' : '0 2px 8px rgba(0,0,0,0.04)' }}
      layout
    >
      {method.isDefault && (
        <div className="h-0.5 bg-blue-500" />
      )}
      <div className="p-4 flex items-center gap-3">
        {/* Type icon */}
        <div className={`w-12 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          isCard ? net.bg : isUpi ? 'bg-violet-600' : 'bg-slate-600'
        }`}>
          {isCard ? (
            <span className="text-[10px] font-black text-white">{net.label}</span>
          ) : isUpi ? (
            <Smartphone size={16} className="text-white" />
          ) : (
            <Building2 size={16} className="text-white" />
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          {isCard && (
            <>
              <p className="text-sm font-bold text-slate-900">
                {method.cardName || method.network || 'Card'} ••••{method.last4}
              </p>
              {method.expiryMM && method.expiryYY && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Expires {String(method.expiryMM).padStart(2, '0')}/{method.expiryYY}
                </p>
              )}
            </>
          )}
          {isUpi && (
            <>
              <p className="text-sm font-bold text-slate-900">{method.upiId}</p>
              <p className="text-xs text-slate-400 mt-0.5 capitalize">{method.upiProvider || 'UPI'}</p>
            </>
          )}
          {method.type === 'netbanking' && (
            <p className="text-sm font-bold text-slate-900">Net Banking</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!method.isDefault && (
            <button
              onClick={onSetDefault}
              disabled={settingDefault}
              title="Set as default"
              className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center hover:bg-amber-100 transition disabled:opacity-50"
            >
              {settingDefault ? (
                <Loader2 size={13} className="animate-spin text-amber-600" />
              ) : (
                <Star size={13} className="text-amber-600" />
              )}
            </button>
          )}
          {method.isDefault && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
              <Star size={9} className="fill-blue-500 text-blue-500" /> Default
            </span>
          )}
          <button
            onClick={onDelete}
            disabled={deleting}
            className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center hover:bg-red-100 transition disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 size={13} className="animate-spin text-red-500" />
            ) : (
              <Trash2 size={13} className="text-red-500" />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function AddMethodForm({ onClose, onAdded }) {
  const [addMethod, { isLoading }] = useAddPaymentMethodMutation();
  const [type, setType] = useState('card');
  const [form, setForm] = useState({
    last4: '', network: 'Visa', cardName: '',
    expiryMM: '', expiryYY: '',
    upiId: '', upiProvider: '',
  });

  function f(key) {
    return {
      value: form[key],
      onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (type === 'card' && (!form.last4 || form.last4.length !== 4)) {
      toast.error('Enter the last 4 digits of your card');
      return;
    }
    if (type === 'upi' && !form.upiId.trim()) {
      toast.error('Enter your UPI ID');
      return;
    }
    try {
      await addMethod({
        type,
        ...(type === 'card' ? {
          last4: form.last4,
          network: form.network,
          cardName: form.cardName || undefined,
          expiryMM: form.expiryMM ? Number(form.expiryMM) : undefined,
          expiryYY: form.expiryYY ? Number(form.expiryYY) : undefined,
        } : {}),
        ...(type === 'upi' ? {
          upiId: form.upiId.trim(),
          upiProvider: form.upiProvider || 'other',
        } : {}),
      }).unwrap();
      toast.success('Payment method saved');
      onAdded();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save payment method');
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className="relative bg-white rounded-t-sheet pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-4" />
        <div className="flex items-center justify-between px-5 mb-4">
          <p className="font-extrabold text-lg text-[#0F172A]">Add Payment Method</p>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-5">
          {/* Type tabs */}
          <div className="flex gap-2 mb-4">
            {[
              { id: 'card',       label: '💳 Card' },
              { id: 'upi',        label: '📱 UPI' },
              { id: 'netbanking', label: '🏦 Net Banking' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${
                  type === t.id ? 'bg-[#0F172A] text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {type === 'card' && (
              <>
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1.5">Last 4 Digits *</p>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest"
                    placeholder="1234"
                    maxLength={4}
                    inputMode="numeric"
                    {...f('last4')}
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1.5">Network</p>
                  <div className="flex gap-2 flex-wrap">
                    {['Visa', 'Mastercard', 'RuPay', 'Amex'].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, network: n }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          form.network === n ? 'bg-[#0F172A] text-white' : 'bg-slate-50 text-slate-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1.5">Card Nickname (optional)</p>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. My HDFC Card"
                    {...f('cardName')}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-500 mb-1.5">Expiry Month</p>
                    <input
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="MM" maxLength={2} inputMode="numeric"
                      {...f('expiryMM')}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-500 mb-1.5">Expiry Year</p>
                    <input
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="YY" maxLength={2} inputMode="numeric"
                      {...f('expiryYY')}
                    />
                  </div>
                </div>
              </>
            )}

            {type === 'upi' && (
              <>
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1.5">UPI ID *</p>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="yourname@upi"
                    {...f('upiId')}
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1.5">Provider</p>
                  <div className="flex gap-2 flex-wrap">
                    {['gpay', 'phonepe', 'paytm', 'bhim', 'other'].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, upiProvider: p }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                          form.upiProvider === p ? 'bg-[#0F172A] text-white' : 'bg-slate-50 text-slate-700'
                        }`}
                      >
                        {UPI_ICONS[p]} {p}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {type === 'netbanking' && (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 text-center">
                Net banking is handled at checkout through your bank's page. Save it here to display as an option during booking.
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 h-12 rounded-2xl border border-slate-200 font-bold text-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={isLoading}
                className="flex-1 h-12 rounded-2xl bg-[#0F172A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {isLoading ? 'Saving…' : 'Save Method'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PaymentMethodsPage() {
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetPaymentMethodsQuery();
  const [deleteMethod] = useDeletePaymentMethodMutation();
  const [setDefault] = useSetDefaultPaymentMethodMutation();
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [defaultingId, setDefaultingId] = useState(null);

  const methods = data?.methods || [];

  async function handleDelete(methodId) {
    if (!window.confirm('Remove this payment method?')) return;
    setDeletingId(methodId);
    try {
      await deleteMethod(methodId).unwrap();
      toast.success('Payment method removed');
    } catch {
      toast.error('Could not remove payment method');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSetDefault(methodId) {
    setDefaultingId(methodId);
    try {
      await setDefault(methodId).unwrap();
      toast.success('Default payment method updated');
    } catch {
      toast.error('Could not update default');
    } finally {
      setDefaultingId(null);
    }
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#F9FAFB] pb-40">
        <header className="sticky top-0 z-20" style={{ background: 'rgba(15,23,42,0.97)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="w-full max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={() => nav('/profile')} className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <ChevronLeft size={16} className="text-white" />
            </button>
            <h1 className="font-black text-white flex-1 flex items-center gap-2">
              <CreditCard size={16} className="text-blue-400" />
              Payment Methods
            </h1>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-white/15 px-3 py-1.5 rounded-full hover:bg-white/25 transition"
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </header>

        <div className="w-full max-w-2xl mx-auto px-4 pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : methods.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <CreditCard size={24} strokeWidth={1.5} className="text-slate-400" />
              </div>
              <p className="font-bold text-slate-900">No saved payment methods</p>
              <p className="text-sm text-slate-400 mt-1">Add a card or UPI ID for faster checkout.</p>
              <button onClick={() => setShowAdd(true)} className="mt-4 btn-primary text-sm">
                Add Payment Method
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {methods.map(m => (
                <MethodCard
                  key={m._id}
                  method={m}
                  onDelete={() => handleDelete(m._id)}
                  onSetDefault={() => handleSetDefault(m._id)}
                  deleting={deletingId === m._id}
                  settingDefault={defaultingId === m._id}
                />
              ))}
              <p className="text-center text-xs text-slate-400 pt-2">
                Card details are tokenized — full card numbers are never stored
              </p>
            </div>
          )}
        </div>

        <AnimatePresence>
          {showAdd && (
            <AddMethodForm
              onClose={() => setShowAdd(false)}
              onAdded={() => { setShowAdd(false); refetch(); }}
            />
          )}
        </AnimatePresence>


      </div>
    </PageTransition>
  );
}
