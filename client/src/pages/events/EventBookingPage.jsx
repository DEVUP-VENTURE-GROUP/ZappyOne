import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Calendar as CalendarIcon, Clock, MapPin, Users, FileText, Camera,
  CheckCircle, AlertCircle, Loader2, Minus, Plus, ChevronRight, Zap, Star, ShieldCheck, Check,
  Navigation, LocateFixed
} from 'lucide-react';
import {
  useGetEventThemeQuery, useCreateEventBookingMutation, usePresignUploadMutation,
  useCreateEventAdvanceOrderMutation, useVerifyEventAdvancePaymentMutation,
  useGetEventConfigQuery,
} from '../../services/api';
import toast from 'react-hot-toast';

import { openCheckout } from '../../services/cashfree';

const TIME_SLOTS = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM'];
const STEPS = ['When & Where', 'Location', 'Specifics', 'Review'];

function PremiumStepIndicator({ currentStep }) {
  return (
    <div className="relative pt-6 pb-2">
      <div className="flex items-center justify-between relative z-10 px-2">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 rounded-full z-0" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full z-0 transition-all duration-700 ease-out" style={{ width: `${(currentStep / 3) * 100}%` }} />
        
        {[0, 1, 2, 3].map(idx => {
          const isCompleted = idx < currentStep;
          const isActive = idx === currentStep;
          return (
            <div key={idx} className="relative flex flex-col items-center">
              <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${isCompleted ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : isActive ? 'bg-white border-2 border-fuchsia-500 text-fuchsia-600 shadow-xl shadow-fuchsia-500/20 scale-110' : 'bg-white border-2 border-slate-200 text-slate-400'}`}>
                {isCompleted ? <Check size={14} strokeWidth={3} /> : <span className="text-xs font-black">{idx + 1}</span>}
              </div>
              <span className={`absolute -bottom-6 w-20 text-center text-[9px] font-bold uppercase tracking-widest transition-colors ${isActive ? 'text-fuchsia-600' : isCompleted ? 'text-indigo-600' : 'text-slate-400'}`}>
                {STEPS[idx]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function EventBookingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [queryParams] = useSearchParams();
  const isScheduled = queryParams.get('scheduled') === 'true';

  const { data }      = useGetEventThemeQuery(id);
  const { data: cfg } = useGetEventConfigQuery();
  const [createBooking]       = useCreateEventBookingMutation();
  const [presignUpload]       = usePresignUploadMutation();
  const [createAdvanceOrder]  = useCreateEventAdvanceOrderMutation();
  const [verifyAdvancePayment]= useVerifyEventAdvancePaymentMutation();

  const theme = data?.theme;
  const advancePct = (cfg?.advancePaymentPct ?? 20) / 100;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    eventDate:     '',
    eventTimeSlot: '',
    address:       { line1: '', city: '', pincode: '', landmark: '' },
    guestCount:    1,
    notes:         '',
    roomPhotos:    [],
  });
  const [uploading,    setUploading]    = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [locating,     setLocating]     = useState(false);
  const [locDetected,  setLocDetected]  = useState(false);

  function set(key, val) { setForm(p => ({ ...p, [key]: val })); }
  function setAddr(key, val) { setLocDetected(false); setForm(p => ({ ...p, address: { ...p.address, [key]: val } })); }

  async function detectLocation() {
    if (!navigator.geolocation) { toast.error('Geolocation not supported by your browser'); return; }
    setLocating(true);
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, enableHighAccuracy: true })
      );
      const { latitude, longitude } = pos.coords;
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await resp.json();
      const a = data.address || {};
      const line1Parts = [a.house_number, a.road, a.neighbourhood, a.suburb].filter(Boolean);
      setForm(p => ({
        ...p,
        address: {
          line1:    line1Parts.join(', ') || data.display_name?.split(',')[0] || '',
          city:     a.city || a.town || a.village || a.county || '',
          pincode:  a.postcode || '',
          landmark: p.address.landmark,
        },
      }));
      setLocDetected(true);
      toast.success('Location detected! Review and edit if needed.');
    } catch (err) {
      if (err.code === 1) toast.error('Location access denied — please allow it in browser settings');
      else toast.error('Could not detect your location. Enter manually.');
    } finally {
      setLocating(false);
    }
  }

  const totalPaise   = theme?.startingPricePaise || 0;
  const advancePaise = Math.round(totalPaise * advancePct);

  async function handleRoomPhoto(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const keys = await Promise.all(files.map(async (file) => {
        const { data: signed } = await presignUpload({ contentType: file.type || 'image/jpeg', folder: 'event-photos' });
        await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } });
        return signed.key;
      }));
      set('roomPhotos', [...form.roomPhotos, ...keys]);
      toast.success(`${keys.length} photo(s) added beautifully! ✨`);
    } catch { toast.error('Upload failed. The magic got interrupted.'); }
    finally { setUploading(false); }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const result = await createBooking({
        themeId: id, ...form, guestCount: Number(form.guestCount),
      }).unwrap();
      const bookingId = result.booking._id;

      const orderRes = await createAdvanceOrder(bookingId).unwrap();

      try {
        const checkoutResp = await openCheckout({
          paymentSessionId: orderRes.paymentSessionId,
          cfOrderId:        orderRes.cfOrderId,
          cashfreeEnv:      orderRes.cashfreeEnv || import.meta.env.VITE_CASHFREE_ENV || 'sandbox',
          amountPaise:      orderRes.amountPaise,
          purpose:          'Event Booking — Advance',
        });
        await verifyAdvancePayment({
          id:          bookingId,
          cfOrderId:   checkoutResp.cfOrderId,
          cfPaymentId: checkoutResp.cfPaymentId,
        }).unwrap();
        toast.success('🎉 Booking Confirmed! Your slot is locked.');
        navigate(`/events/bookings/${bookingId}?paid=true`);
      } catch (payErr) {
        const msg = payErr?.message || '';
        if (msg.includes('cancelled')) {
          toast('Payment incomplete. We reserved your slot for 15 mins!', { icon: '⏱️' });
          navigate(`/events/bookings/${bookingId}`);
        } else {
          throw payErr;
        }
      }
    } catch (err) {
      const msg = err?.data?.message || err?.data?.error || 'Booking failed';
      toast.error(msg);
      if (err?.data?.code === 'SLOT_TAKEN') toast.error('Oh no! Someone just grabbed that slot.');
    } finally { setSubmitting(false); }
  }

  const canNext = [
    form.eventDate && form.eventTimeSlot,
    form.address.line1 && form.address.city,
    true,
    true,
  ];

  if (!theme) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-fuchsia-500" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-32 font-sans selection:bg-fuchsia-100 selection:text-fuchsia-900">
      
      {/* ─── Premium Glassy Header ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-slate-200/50 pt-10 pb-8 px-4 shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
        <div className="max-w-md lg:max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => step > 0 ? setStep(s => s - 1) : navigate(-1)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-200 hover:scale-105 transition-all">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1">
              <h1 className="font-black text-2xl text-slate-900 tracking-tight">Reserve Experience</h1>
            </div>
            <img src={theme.coverImage} className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-200" />
          </div>
          
          <PremiumStepIndicator currentStep={step} />
        </div>
      </div>

      <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          
          {/* ─── Step 0: Date & Time ────────────────────────────────────────────── */}
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
              
              <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center"><CalendarIcon size={20} /></div>
                  <h3 className="font-black text-lg text-slate-900">Select Date</h3>
                </div>
                <input 
                  type="date" 
                  value={form.eventDate} 
                  onChange={e => set('eventDate', e.target.value)}
                  min={new Date(Date.now() + 86_400_000).toISOString().split('T')[0]}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all cursor-pointer" 
                />
              </div>

              <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-fuchsia-50 text-fuchsia-500 flex items-center justify-center"><Clock size={20} /></div>
                  <div>
                    <h3 className="font-black text-lg text-slate-900">Select Time</h3>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Available Slots</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  {TIME_SLOTS.map(slot => (
                    <button 
                      key={slot} 
                      onClick={() => set('eventTimeSlot', slot)}
                      className={`py-3.5 rounded-2xl text-xs font-black transition-all duration-300 ${form.eventTimeSlot === slot ? 'bg-slate-900 text-white shadow-[0_10px_20px_rgba(0,0,0,0.15)] scale-105 ring-2 ring-slate-900 ring-offset-2' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-400 hover:bg-white hover:shadow-sm'}`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Step 1: Address ────────────────────────────────────────────────── */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center"><MapPin size={20} /></div>
                  <div>
                    <h3 className="font-black text-lg text-slate-900">Venue Details</h3>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Where's the magic happening?</p>
                  </div>
                </div>

                {/* ── Detect current location ──────────────────────────── */}
                <button
                  type="button"
                  onClick={detectLocation}
                  disabled={locating}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl border-2 border-dashed border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 font-bold text-sm transition-all disabled:opacity-60 active:scale-[0.98] mb-4"
                >
                  {locating ? (
                    <><Loader2 size={16} className="animate-spin" /> Detecting location…</>
                  ) : locDetected ? (
                    <><CheckCircle size={16} className="text-emerald-500" /> Location detected — edit below if needed</>
                  ) : (
                    <><LocateFixed size={16} /> Use My Current Location</>
                  )}
                </button>

                <div className="space-y-4">
                  {[
                    { key: 'line1',   label: 'Flat / House / Building', required: true  },
                    { key: 'city',    label: 'City',                    required: true  },
                    { key: 'pincode', label: 'Pincode',                 required: false },
                  ].map(({ key, label, required }) => (
                    <div key={key} className="relative">
                      <input
                        id={key}
                        value={form.address[key]}
                        onChange={e => setAddr(key, e.target.value)}
                        className="peer w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 pt-7 pb-3 text-slate-900 font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder-transparent"
                        placeholder={label}
                      />
                      <label htmlFor={key} className="absolute left-5 top-2 text-[10px] uppercase tracking-widest font-bold text-slate-400 peer-placeholder-shown:top-5 peer-placeholder-shown:text-sm peer-placeholder-shown:normal-case peer-placeholder-shown:font-semibold peer-focus:top-2 peer-focus:text-[10px] peer-focus:uppercase peer-focus:font-bold peer-focus:text-indigo-600 transition-all pointer-events-none">
                        {label} {required && <span className="text-rose-400">*</span>}
                      </label>
                    </div>
                  ))}

                  {/* Landmark / note for the decorator */}
                  <div className="relative">
                    <textarea
                      id="landmark"
                      rows={2}
                      value={form.address.landmark}
                      onChange={e => setAddr('landmark', e.target.value)}
                      placeholder="Landmark / note"
                      className="peer w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 pt-7 pb-3 text-slate-900 font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none placeholder-transparent"
                    />
                    <label htmlFor="landmark" className="absolute left-5 top-2 text-[10px] uppercase tracking-widest font-bold text-slate-400 peer-placeholder-shown:top-5 peer-placeholder-shown:text-sm peer-placeholder-shown:normal-case peer-placeholder-shown:font-semibold peer-focus:top-2 peer-focus:text-[10px] peer-focus:uppercase peer-focus:font-bold peer-focus:text-indigo-600 transition-all pointer-events-none flex items-center gap-1">
                      <Navigation size={9} /> Landmark / Note for decorator
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Step 2: Event Details ──────────────────────────────────────────── */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              
              {/* Guest Counter */}
              <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500"><Users size={24} /></div>
                  <div>
                    <h3 className="font-black text-slate-900">Total Guests</h3>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Kids & Adults</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1.5 shadow-inner">
                  <button onClick={() => set('guestCount', Math.max(1, (Number(form.guestCount) || 1) - 1))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white hover:bg-slate-100 text-slate-600 shadow-sm transition-all active:scale-95" aria-label="Fewer guests"><Minus size={18} /></button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={5000}
                    value={form.guestCount}
                    onChange={e => set('guestCount', e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                    onBlur={e => {
                      const n = Math.floor(Number(e.target.value)) || 1;
                      set('guestCount', Math.min(5000, Math.max(1, n)));
                    }}
                    className="font-black text-xl text-slate-900 w-16 text-center bg-transparent outline-none focus:ring-2 focus:ring-rose-400/30 rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    aria-label="Total guests"
                  />
                  <button onClick={() => set('guestCount', Math.min(5000, (Number(form.guestCount) || 0) + 1))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white hover:bg-slate-100 text-slate-600 shadow-sm transition-all active:scale-95" aria-label="More guests"><Plus size={18} /></button>
                </div>
              </div>

              {/* Special Notes */}
              <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center"><FileText size={20} /></div>
                  <h3 className="font-black text-slate-900">Special Requests</h3>
                </div>
                <textarea 
                  value={form.notes} 
                  onChange={e => set('notes', e.target.value)} 
                  placeholder="Any color themes, allergies, or surprises planned? Let the creator know!"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 font-medium focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none placeholder:text-slate-400" 
                  rows={3} 
                />
              </div>

              {/* Room Photos */}
              <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center"><Camera size={20} /></div>
                  <div>
                    <h3 className="font-black text-slate-900">Space Photos <span className="text-slate-400 font-medium text-xs">(Optional)</span></h3>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Help the creator plan</p>
                  </div>
                </div>
                
                <label className="flex flex-col items-center justify-center w-full bg-slate-50 border-2 border-dashed border-slate-300 rounded-[1.5rem] p-6 cursor-pointer hover:bg-slate-100 hover:border-indigo-300 transition-all group">
                  {uploading ? (
                    <Loader2 size={28} className="animate-spin text-indigo-500 mb-2" />
                  ) : (
                    <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 group-hover:text-indigo-500 group-hover:scale-110 transition-all mb-3">
                      <Camera size={24} />
                    </div>
                  )}
                  <span className="font-bold text-slate-700">{uploading ? 'Uploading magic...' : 'Tap to upload photos'}</span>
                  <input type="file" accept="image/*" multiple onChange={handleRoomPhoto} className="hidden" />
                </label>

                {form.roomPhotos.length > 0 && (
                  <div className="flex gap-3 mt-4 overflow-x-auto pb-2">
                    {form.roomPhotos.map((url, i) => (
                      <div key={i} className="relative shrink-0 w-20 h-20 rounded-2xl overflow-hidden shadow-sm border border-slate-200">
                        <img src={url} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ─── Step 3: Review & Pay (Ticket Style) ────────────────────────────── */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              
              <div className="bg-white rounded-[2rem] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden relative">
                {/* Decorative top gradient */}
                <div className="h-2 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500" />
                
                {/* Ticket Content */}
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-4 mb-8">
                    <img src={theme.coverImage} className="w-16 h-16 rounded-2xl object-cover shadow-sm border border-slate-100" />
                    <div>
                      <h3 className="font-black text-xl text-slate-900 leading-tight mb-1">{theme.title}</h3>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-black tracking-widest uppercase">
                        {theme.categoryId?.name || 'Exclusive'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1 flex items-center gap-1.5"><CalendarIcon size={12}/> Date</p>
                      <p className="font-bold text-slate-800">{new Date(form.eventDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1 flex items-center gap-1.5"><Clock size={12}/> Time</p>
                      <p className="font-bold text-slate-800">{form.eventTimeSlot}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1 flex items-center gap-1.5"><MapPin size={12}/> Venue</p>
                      <p className="font-bold text-slate-800">{form.address.line1}, {form.address.city} {form.address.pincode}</p>
                      {form.address.landmark && (
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Navigation size={10}/> {form.address.landmark}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Perforated Divider */}
                <div className="relative flex items-center px-4 py-2">
                  <div className="absolute left-0 w-5 h-10 bg-slate-50 rounded-r-full -translate-x-1 shadow-inner border-y border-r border-slate-200" />
                  <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                  <div className="absolute right-0 w-5 h-10 bg-slate-50 rounded-l-full translate-x-1 shadow-inner border-y border-l border-slate-200" />
                </div>

                {/* Payment Breakdown */}
                <div className="p-6 md:p-8 bg-slate-50/50">
                  <h4 className="font-black text-slate-900 mb-5 flex items-center gap-2"><Zap size={18} className="text-yellow-500 fill-yellow-500"/> Cost Breakdown</h4>
                  <div className="space-y-4 text-[15px]">
                    <div className="flex justify-between text-slate-600 font-medium">
                      <span>Total Package</span>
                      <span className="font-bold text-slate-900">₹{Math.round(totalPaise / 100).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 font-medium">
                      <span>Taxes & Fees</span>
                      <span className="text-emerald-500 font-bold uppercase tracking-wide text-xs flex items-center gap-1"><CheckCircle size={14}/> Included</span>
                    </div>
                    
                    <div className="border-t border-slate-200 pt-4 flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm">
                      <div>
                        <span className="font-black text-slate-900 block">Advance Required ({Math.round(advancePct * 100)}%)</span>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pay now to lock slot</span>
                      </div>
                      <span className="font-black text-3xl text-indigo-600 tracking-tighter">₹{Math.round(advancePaise / 100).toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-xs text-slate-500 text-center font-medium mt-2">
                      Remaining ₹{Math.round((totalPaise - advancePaise) / 100).toLocaleString('en-IN')} to be paid on event day
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <ShieldCheck size={24} className="text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-slate-900">Worry-Free Cancellation</p>
                  <p className="text-xs text-slate-500 mt-1">Full refund if cancelled 7+ days before the event. You're fully protected.</p>
                </div>
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ─── Floating Neon Action Bar ─────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pb-6 z-50">
        <div className="max-w-md lg:max-w-2xl mx-auto">
          {step < 3 ? (
            <button 
              onClick={() => setStep(s => s + 1)} 
              disabled={!canNext[step]}
              className="relative w-full py-4 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 hover:shadow-2xl hover:-translate-y-1"
            >
              CONTINUE <ChevronRight size={18} />
            </button>
          ) : (
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 rounded-[1.5rem] blur opacity-40 group-hover:opacity-70 transition duration-500 animate-pulse" />
              <button 
                onClick={handleSubmit} 
                disabled={submitting}
                className="relative w-full py-4 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-80"
              >
                {submitting ? (
                  <><Loader2 size={20} className="animate-spin" /> SECURING SLOT...</>
                ) : (
                  <><Zap size={18} className="fill-yellow-400 text-yellow-400" /> SECURE BOOKING</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
}
