import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectRole } from '../../modules/auth/authSlice';
import MyVerificationPanel from '../MyVerificationPanel';

/** Verification, as the provider sees it: what they uploaded and where each service stands. */
export default function MyDocumentsPage() {
  const nav = useNavigate();
  const isShop = useSelector(selectRole) === 'shop';
  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16">
      <header className="page-header"><div className="page-header-inner">
        <button type="button" onClick={() => nav(-1)} className="back-btn" aria-label="Back"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">My documents</h1>
      </div></header>
      <div className="mx-auto max-w-lg px-4 pt-4 lg:max-w-2xl">
        <MyVerificationPanel isShop={isShop} />
      </div>
    </div>
  );
}
