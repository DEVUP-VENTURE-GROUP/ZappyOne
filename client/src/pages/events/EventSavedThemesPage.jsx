import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Heart, Star, Loader2 } from 'lucide-react';
import { useGetSavedEventThemesQuery, useToggleSaveEventThemeMutation } from '@shared/services/api';
import toast from 'react-hot-toast';

export default function EventSavedThemesPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useGetSavedEventThemesQuery();
  const [toggleSave] = useToggleSaveEventThemeMutation();
  const themes = data?.themes || [];

  async function handleUnsave(id) {
    try { await toggleSave(id).unwrap(); refetch(); toast.success('Removed from saved'); }
    catch { toast.error('Failed'); }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-bold text-slate-900">Saved Themes</h1>
            <p className="text-xs text-slate-400">{themes.length} saved</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div>
        ) : themes.length === 0 ? (
          <div className="text-center py-20">
            <Heart size={48} className="text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No saved themes yet</p>
            <p className="text-sm text-slate-400 mt-1">Tap the heart icon on any theme to save it</p>
            <button onClick={() => navigate('/events')} className="mt-4 px-5 py-2.5 bg-gradient-to-r from-zappy-600 to-purple-600 text-white rounded-xl text-sm font-semibold">Browse Events</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {themes.map(theme => (
              <motion.div key={theme._id} whileHover={{ y: -2 }}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer"
                onClick={() => navigate(`/events/themes/${theme._id}`)}>
                <div className="relative">
                  <img src={theme.coverImage} alt={theme.title} className="w-full h-44 object-cover" />
                  <button onClick={e => { e.stopPropagation(); handleUnsave(theme._id); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 flex items-center justify-center">
                    <Heart size={12} className="text-white fill-white" />
                  </button>
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm text-slate-900 leading-tight truncate">{theme.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{theme.categoryId?.emoji} {theme.categoryId?.name}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-zappy-600">₹{Math.round((theme.startingPricePaise || 0) / 100).toLocaleString('en-IN')}</span>
                    <div className="flex items-center gap-0.5">
                      <Star size={10} className="text-amber-400 fill-amber-400" />
                      <span className="text-xs text-slate-500">{theme.rating?.toFixed(1) || '–'}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
