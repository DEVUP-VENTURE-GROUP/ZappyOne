import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, Wallet, Bell, Star, MapPin, HelpCircle,
  LogOut, ChevronRight, ShieldCheck, Home, Briefcase, Plus,
  Trash2, X, Loader2, Scale, HeadphonesIcon, CreditCard,
  Pencil, Check, TrendingUp, Tag, Calendar, Shield, Gift, Search,
} from 'lucide-react';
import { reverseGeocode } from '../utils/reverseGeocode';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import { selectAuth, logout } from '../modules/auth/authSlice';
import {
  useGetMeQuery, useGetAddressesQuery, useAddAddressMutation,
  useDeleteAddressMutation, useEditAddressMutation, useSetDefaultAddressMutation,
} from '../services/api';
import PageTransition from '../components/common/PageTransition';
import { SkeletonProfileHeader, SkeletonList, SkeletonCard } from '../components/common/Skeleton';
import { staggerContainer, fadeInUp } from '../lib/animations';
import toast from 'react-hot-toast';

const TAG_META = {
  home:  { icon: Home,      bg: 'bg-blue-50',   text: 'text-blue-600',   label: 'Home' },
  work:  { icon: Briefcase, bg: 'bg-purple-50',  text: 'text-purple-600', label: 'Work' },
  other: { icon: MapPin,    bg: 'bg-slate-50',   text: 'text-slate-500',  label: 'Other' },
};

const EMPTY_ADDR = { label: '', address: '', lat: '', lng: '', tag: 'other' };

export default function ProfilePage() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const { profile, role } = useSelector(selectAuth);
  const { data, isLoading } = useGetMeQuery();
  const { data: addrData } = useGetAddressesQuery();
  const [addAddress, { isLoading: addingAddr }] = useAddAddressMutation();
  const [deleteAddress] = useDeleteAddressMutation();
  const [editAddress, { isLoading: editingAddr }] = useEditAddressMutation();
  const [setDefaultAddress] = useSetDefaultAddressMutation();
  const [showLogout,    setShowLogout]    = useState(false);
  const [showAddrForm,  setShowAddrForm]  = useState(false);
  const [editingAddrId, setEditingAddrId] = useState(null);
  const [newAddr,       setNewAddr]       = useState(EMPTY_ADDR);
  const [editAddr,      setEditAddr]      = useState(EMPTY_ADDR);
  const [addrGeoErr,    setAddrGeoErr]    = useState('');
  // Address autocomplete (replaces raw lat/lng entry — no user knows their coords)
  const [addrQuery,     setAddrQuery]     = useState('');
  const [addrResults,   setAddrResults]   = useState([]);
  const [addrSearching, setAddrSearching] = useState(false);

  // Debounced Mapbox forward-geocode — same source the Home location sheet uses.
  useEffect(() => {
    if (!addrQuery.trim() || addrQuery.length < 3) { setAddrResults([]); return; }
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) return;
    const ctrl = new AbortController();
    setAddrSearching(true);
    const t = setTimeout(() => {
      fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addrQuery)}.json` +
        `?access_token=${token}&language=en&country=IN&types=address,neighborhood,locality,place&limit=5`,
        { signal: ctrl.signal },
      )
        .then((r) => r.json())
        .then((d) => { setAddrResults(d.features || []); setAddrSearching(false); })
        .catch(() => setAddrSearching(false));
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [addrQuery]);

  function resetAddrForm() {
    setNewAddr(EMPTY_ADDR);
    setAddrQuery('');
    setAddrResults([]);
    setAddrGeoErr('');
  }

  // Picking a suggestion fills the address + coordinates in one tap. The search
  // box is cleared (not set to the picked address) so the debounced effect
  // doesn't immediately re-open the dropdown; the pinned address shows below.
  function pickAddrResult(feat) {
    const [lng, lat] = feat.center;
    const full = feat.place_name || feat.text;
    setNewAddr((p) => ({ ...p, address: full, lat: String(lat), lng: String(lng) }));
    setAddrQuery('');
    setAddrResults([]);
  }

  const user      = data?.user || profile;
  const addresses = addrData?.addresses || [];

  const initials = (user?.name || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function handleLogout() {
    dispatch(logout());
    nav('/login', { replace: true });
    toast.success('Logged out successfully');
  }

  function detectLocation() {
    setAddrGeoErr('');
    if (!navigator.geolocation) { setAddrGeoErr('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Reverse-geocode so the address text is filled too — the form needs a
        // non-empty address, and the user shouldn't have to type it after detect.
        let address = '';
        try {
          const g = await reverseGeocode(lat, lng);
          address = [g.primary, g.secondary].filter(Boolean).join(', ');
        } catch { /* keep coords even if naming fails */ }
        setNewAddr((prev) => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6), address: address || prev.address }));
        if (address) setAddrQuery(address);
      },
      () => setAddrGeoErr('Could not detect location')
    );
  }

  async function submitAddress(e) {
    e.preventDefault();
    if (!newAddr.label.trim() || !newAddr.address.trim() || !newAddr.lat || !newAddr.lng) {
      toast.error('Fill in all fields');
      return;
    }
    try {
      await addAddress({
        label: newAddr.label,
        address: newAddr.address,
        lat: parseFloat(newAddr.lat),
        lng: parseFloat(newAddr.lng),
        tag: newAddr.tag,
      }).unwrap();
      toast.success('Address saved');
      resetAddrForm();
      setShowAddrForm(false);
    } catch { toast.error('Could not save address'); }
  }

  async function handleDeleteAddr(addrId, label) {
    try {
      await deleteAddress(addrId).unwrap();
      toast.success(`Removed ${label}`);
    } catch { toast.error('Could not delete address'); }
  }

  function startEditAddr(a) {
    const [lng, lat] = a.location?.coordinates || [0, 0];
    setEditAddr({
      label: a.label || '',
      address: a.address || '',
      lat: String(lat),
      lng: String(lng),
      tag: a.tag || 'other',
    });
    setEditingAddrId(a._id);
  }

  async function submitEditAddr(e) {
    e.preventDefault();
    if (!editAddr.label.trim() || !editAddr.address.trim()) {
      toast.error('Label and address are required');
      return;
    }
    try {
      await editAddress({
        addrId: editingAddrId,
        label: editAddr.label,
        address: editAddr.address,
        lat: parseFloat(editAddr.lat),
        lng: parseFloat(editAddr.lng),
        tag: editAddr.tag,
      }).unwrap();
      toast.success('Address updated');
      setEditingAddrId(null);
    } catch { toast.error('Could not update address'); }
  }

  async function handleSetDefault(addrId) {
    try {
      await setDefaultAddress(addrId).unwrap();
      toast.success('Default address set');
    } catch { toast.error('Could not set default'); }
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#F9FAFB] pb-40">
        <header className="page-header !bg-transparent border-none">
          <div className="page-header-inner justify-center pt-4">
            <h1 className="text-xl font-black tracking-tight text-[#0F172A]">Profile</h1>
            <span className="absolute right-4 chip-neutral bg-white/60 backdrop-blur-md capitalize font-bold">{role}</span>
          </div>
        </header>

        {isLoading ? (
          <div className="page-container">
            <SkeletonProfileHeader />
            <div className="pt-5 space-y-4">
              <SkeletonList count={3} Item={SkeletonCard} />
            </div>
          </div>
        ) : (
          <motion.div
            className="page-container lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 lg:pt-6"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {/* Avatar section */}
            <motion.div
              className="py-8 relative"
              variants={fadeInUp}
            >
              {/* Decorative glow behind avatar */}
              <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-32 bg-zappy-500/30 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex flex-col items-center text-center gap-3 relative z-10">
                <motion.div
                  className="w-24 h-24 rounded-[32px] flex items-center justify-center shrink-0 shadow-xl border-4 border-white overflow-hidden bg-slate-50 relative z-10"
                  whileHover={{ scale: 1.05, rotate: -2 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <img 
                    src={user?.avatar || '/images/zappy_tower_avatar.webp'} 
                    alt={user?.name || 'User'} 
                    className="w-full h-full object-cover"
                  />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-black text-2xl tracking-tight text-[#0F172A]">{user?.name || 'User'}</h2>
                  <p className="text-sm font-semibold text-slate-500 mt-1">{user?.phone || user?.email || '—'}</p>
                </div>
                <div className="flex items-center gap-1.5 bg-success-50/80 backdrop-blur-md px-3 py-1.5 rounded-full mt-2 shadow-sm border border-success-100">
                  <ShieldCheck size={14} strokeWidth={3} className="text-success-600" />
                  <span className="text-xs font-black tracking-wide text-success-700">VERIFIED</span>
                </div>
              </div>
            </motion.div>

            {/* Menu */}
            <div className="pt-5 lg:pt-0 space-y-4">
              <motion.div variants={fadeInUp}>
                <MenuSection title="Activity">
                  <MenuItem Icon={ClipboardList} label="My Bookings" sublabel="View order history" onClick={() => nav('/orders')} />
                  <MenuItem Icon={Wallet} label="Wallet" sublabel="Balance & transactions" onClick={() => nav('/wallet')} />
                  <MenuItem Icon={Gift} label="Rewards" sublabel="Points & scratch cards" onClick={() => nav('/rewards')} />
                  <MenuItem Icon={CreditCard} label="Payment Methods" sublabel="Cards, UPI & more" onClick={() => nav('/payments')} />
                  <MenuItem Icon={Bell} label="Notifications" onClick={() => nav('/notifications')} />
                  <MenuItem Icon={TrendingUp} label="Spending Analytics" sublabel="Monthly & service breakdown" onClick={() => nav('/spending')} />
                  <MenuItem Icon={Tag} label="Promo Codes" sublabel="Browse all active offers" onClick={() => nav('/promos')} />
                  <MenuItem Icon={Calendar} label="Scheduled Bookings" sublabel="View & reschedule" onClick={() => nav('/scheduled')} />
                </MenuSection>
              </motion.div>

              {/* ── Language ── */}
              <motion.div variants={fadeInUp}>
                <p className="section-title px-1 mb-2">Language</p>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                  <LanguageSwitcher variant="menu" />
                </div>
              </motion.div>

              {/* ── Saved Addresses ── */}
              <motion.div variants={fadeInUp}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="section-title">Saved Addresses</p>
                  <button
                    onClick={() => setShowAddrForm(v => !v)}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                    Add
                  </button>
                </div>

                {/* Add address form */}
                <AnimatePresence>
                  {showAddrForm && (
                    <motion.form
                      onSubmit={submitAddress}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden mb-2"
                    >
                      <div className="card space-y-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-bold text-[#0F172A]">New Address</p>
                          <button type="button" onClick={() => { setShowAddrForm(false); resetAddrForm(); }}>
                            <X size={15} className="text-slate-400" />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          {['home', 'work', 'other'].map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setNewAddr(p => ({ ...p, tag }))}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                                newAddr.tag === tag ? 'bg-[#0F172A] text-white' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                        <input
                          className="input text-sm"
                          placeholder="Label (e.g. Mom's House)"
                          value={newAddr.label}
                          onChange={e => setNewAddr(p => ({ ...p, label: e.target.value }))}
                        />

                        {/* Address autocomplete — search and pick; coordinates fill automatically */}
                        <div className="relative">
                          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            className="input text-sm !pl-9"
                            placeholder="Search your address…"
                            value={addrQuery}
                            onChange={e => {
                              setAddrQuery(e.target.value);
                              // Editing the query invalidates any previously pinned pick.
                              setNewAddr(p => ({ ...p, address: '', lat: '', lng: '' }));
                            }}
                          />
                          {addrSearching && (
                            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" />
                          )}
                          {addrResults.length > 0 && (
                            <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border border-slate-100 shadow-lg overflow-hidden divide-y divide-slate-50">
                              {addrResults.map((feat) => (
                                <button
                                  key={feat.id}
                                  type="button"
                                  onClick={() => pickAddrResult(feat)}
                                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition"
                                >
                                  <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-[#0F172A] truncate">{feat.text}</p>
                                    <p className="text-[11px] text-slate-400 truncate">{feat.place_name}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Pinned-location confirmation */}
                        {newAddr.lat && newAddr.lng && (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                            <Check size={13} strokeWidth={2.5} />
                            <span className="truncate">Location pinned{newAddr.address ? ` · ${newAddr.address}` : ''}</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={detectLocation}
                          className="text-xs font-semibold text-blue-600 flex items-center gap-1"
                        >
                          <MapPin size={11} strokeWidth={2} />
                          Use my current location
                        </button>
                        {addrGeoErr && <p className="text-xs text-red-500">{addrGeoErr}</p>}
                        <button type="submit" disabled={addingAddr} className="btn-primary w-full text-sm">
                          {addingAddr ? <Loader2 size={14} className="animate-spin" /> : 'Save Address'}
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>

                {addresses.length > 0 ? (
                  <div className="card divide-y divide-slate-100 p-0 overflow-hidden">
                    {addresses.map((a) => {
                      const m = TAG_META[a.tag] || TAG_META.other;
                      const Icon = m.icon;
                      const isEditing = editingAddrId === a._id;
                      return (
                        <div key={a._id}>
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center shrink-0`}>
                              <Icon size={13} strokeWidth={2} className={m.text} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{a.label}</p>
                                {a.isDefault && (
                                  <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">DEFAULT</span>
                                )}
                              </div>
                              <p className="text-sm font-medium text-[#0F172A] truncate">{a.address}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {!a.isDefault && (
                                <button
                                  onClick={() => handleSetDefault(a._id)}
                                  title="Set as default"
                                  className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center hover:bg-amber-100 transition"
                                >
                                  <Check size={11} strokeWidth={2.5} className="text-amber-600" />
                                </button>
                              )}
                              <button
                                onClick={() => isEditing ? setEditingAddrId(null) : startEditAddr(a)}
                                className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center hover:bg-blue-100 transition"
                              >
                                <Pencil size={11} strokeWidth={2} className="text-blue-600" />
                              </button>
                              <button
                                onClick={() => handleDeleteAddr(a._id, a.label)}
                                className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 transition"
                              >
                                <Trash2 size={11} strokeWidth={2} className="text-red-500" />
                              </button>
                            </div>
                          </div>
                          {/* Inline edit form */}
                          <AnimatePresence>
                            {isEditing && (
                              <motion.form
                                onSubmit={submitEditAddr}
                                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-3 pt-1 bg-slate-50 space-y-2 border-t border-slate-100">
                                  <div className="flex gap-2">
                                    {['home', 'work', 'other'].map(tag => (
                                      <button key={tag} type="button"
                                        onClick={() => setEditAddr(p => ({ ...p, tag }))}
                                        className={`flex-1 py-1 rounded-lg text-xs font-bold capitalize transition ${
                                          editAddr.tag === tag ? 'bg-[#0F172A] text-white' : 'bg-white text-slate-600 border border-slate-200'
                                        }`}
                                      >
                                        {tag}
                                      </button>
                                    ))}
                                  </div>
                                  <input className="input text-sm w-full" placeholder="Label"
                                    value={editAddr.label} onChange={e => setEditAddr(p => ({ ...p, label: e.target.value }))} />
                                  <input className="input text-sm w-full" placeholder="Full address"
                                    value={editAddr.address} onChange={e => setEditAddr(p => ({ ...p, address: e.target.value }))} />
                                  <div className="flex gap-2 pt-1">
                                    <button type="button" onClick={() => setEditingAddrId(null)}
                                      className="flex-1 h-9 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">Cancel</button>
                                    <button type="submit" disabled={editingAddr}
                                      className="flex-1 h-9 rounded-lg bg-[#0F172A] text-white text-xs font-bold flex items-center justify-center gap-1.5">
                                      {editingAddr ? <Loader2 size={12} className="animate-spin" /> : null}
                                      Save
                                    </button>
                                  </div>
                                </div>
                              </motion.form>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                ) : !showAddrForm && (
                  <div className="card text-center py-4">
                    <MapPin size={18} strokeWidth={1.5} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No saved addresses yet</p>
                    <button onClick={() => setShowAddrForm(true)} className="text-xs font-bold text-blue-600 mt-1">
                      Add Home or Work
                    </button>
                  </div>
                )}
              </motion.div>

              <motion.div variants={fadeInUp}>
                <MenuSection title="Account">
                  <MenuItem Icon={Star} label="Plans & Subscriptions" sublabel="Premium & Pro benefits" onClick={() => nav('/plans')} />
                </MenuSection>
              </motion.div>

              <motion.div variants={fadeInUp}>
                <MenuSection title="Help">
                  <MenuItem Icon={HeadphonesIcon} label="Help & Support" sublabel="Create a support ticket" onClick={() => nav('/support')} />
                  <MenuItem Icon={Scale} label="Disputes" sublabel="Raise or track an issue" onClick={() => nav('/disputes')} />
                  <MenuItem Icon={Bell} label="Notification Settings" sublabel="Manage what you receive" onClick={() => nav('/notification-prefs')} />
                  <MenuItem Icon={Shield} label="Account Security" sublabel="Login history & deletion" onClick={() => nav('/account-security')} />
                </MenuSection>
              </motion.div>

              {/* Logout */}
              <motion.div variants={fadeInUp}>
                <AnimatePresence mode="wait">
                  {!showLogout ? (
                    <motion.button
                      key="logout-btn"
                      onClick={() => setShowLogout(true)}
                      className="w-full flex items-center gap-3 px-4 py-4 rounded-[24px] bg-red-50 ring-1 ring-red-100/50 text-red-500 hover:bg-red-100 transition shadow-sm border border-red-100"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                        <LogOut size={16} strokeWidth={2} className="text-red-500" />
                      </div>
                      <span className="font-semibold text-sm flex-1 text-left">Log Out</span>
                    </motion.button>
                  ) : (
                    <motion.div
                      key="logout-confirm"
                      className="card bg-red-50 ring-red-200 space-y-3"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.18 }}
                    >
                      <p className="text-sm font-semibold text-red-800">Are you sure you want to log out?</p>
                      <div className="flex gap-2">
                        <button onClick={() => setShowLogout(false)} className="btn-secondary flex-1">Cancel</button>
                        <button onClick={handleLogout} className="btn-danger flex-1">Log Out</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              <p className="text-center text-xs text-slate-300 pb-4">Zappy Platform · v1.0</p>
            </div>
          </motion.div>
        )}


      </div>
    </PageTransition>
  );
}

function MenuSection({ title, children }) {
  return (
    <div className="mb-6">
      <p className="px-4 mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      <div className="card !p-1 overflow-hidden space-y-0.5">
        {children}
      </div>
    </div>
  );
}

function MenuItem({ Icon, label, sublabel, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-3 py-3 text-left hover:bg-slate-50/80 rounded-[20px] transition"
      whileHover={{ scale: 0.99, backgroundColor: 'rgba(248,250,252,0.8)' }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="w-10 h-10 rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 flex items-center justify-center shrink-0">
        <Icon size={18} strokeWidth={2} className="text-zappy-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-[#0F172A]">{label}</p>
        {sublabel && <p className="text-xs font-medium text-slate-400 mt-0.5 truncate">{sublabel}</p>}
      </div>
      <ChevronRight size={16} strokeWidth={2.5} className="text-slate-300 shrink-0" />
    </motion.button>
  );
}
