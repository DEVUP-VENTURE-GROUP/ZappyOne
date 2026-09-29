import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ZI_SLUG, ziPath } from './config/zi';
import './styles/index.css';

const ZILogin         = lazy(() => import('./pages/zi/ZILogin'));
const ZIApp           = lazy(() => import('./pages/zi/ZIApp'));
const ZICommandCenter = lazy(() => import('./pages/zi/ZICommandCenter'));
const ZIExpansion     = lazy(() => import('./pages/zi/ZIExpansion'));
const ZIAIAssistant   = lazy(() => import('./pages/zi/ZIAIAssistant'));
const ZIForecasting   = lazy(() => import('./pages/zi/ZIForecasting'));
const ZIFraudCenter   = lazy(() => import('./pages/zi/ZIFraudCenter'));
const ZIPricingEngine = lazy(() => import('./pages/zi/ZIPricingEngine'));
const ZIPartnerIntel  = lazy(() => import('./pages/zi/ZIPartnerIntel'));
const ZIWorkerIntel   = lazy(() => import('./pages/zi/ZIWorkerIntel'));
const ZIInvestorBoardroom = lazy(() => import('./pages/zi/ZIInvestorBoardroom'));
const ZISimulator     = lazy(() => import('./pages/zi/ZISimulator'));
const ZIHeatmaps      = lazy(() => import('./pages/zi/ZIHeatmaps'));
const ZIAdsManager    = lazy(() => import('./pages/zi/ZIAdsManager'));

function Loader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center">
          <span className="text-white font-black text-lg">ZI</span>
        </div>
        <div className="w-5 h-5 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('zi-root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path={ziPath('/login')} element={<ZILogin />} />
          <Route path={`/${ZI_SLUG}`} element={<ZIApp />}>
            <Route index element={<ZICommandCenter />} />
            <Route path="expansion" element={<ZIExpansion />} />
            <Route path="ai" element={<ZIAIAssistant />} />
            <Route path="forecast" element={<ZIForecasting />} />
            <Route path="fraud" element={<ZIFraudCenter />} />
            <Route path="pricing" element={<ZIPricingEngine />} />
            <Route path="partners" element={<ZIPartnerIntel />} />
            <Route path="workers" element={<ZIWorkerIntel />} />
            <Route path="investor" element={<ZIInvestorBoardroom />} />
            <Route path="simulator" element={<ZISimulator />} />
            <Route path="heatmaps" element={<ZIHeatmaps />} />
            <Route path="ads" element={<ZIAdsManager />} />
          </Route>
          <Route path="*" element={<Navigate to={ziPath('/login')} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>
);
