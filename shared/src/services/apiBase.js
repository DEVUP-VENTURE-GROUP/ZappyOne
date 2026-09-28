/**
 * Single source of truth for the API origin.
 *
 * Frontend (Vercel) and API (EC2) are on different origins in production, so a
 * relative `/api/...` request hits Vercel and returns the SPA index.html (or a
 * 404) instead of the API. Any raw fetch() — especially binary streams like KYC
 * docs, invoices, and call/SOS actions that bypass RTK Query — MUST prefix this
 * base. RTK Query already uses `${VITE_API_URL}/api` in services/api.js.
 */
export const API_BASE = import.meta.env.VITE_API_URL || '';

/** Build an absolute API URL: apiUrl('/api/orders/123/invoice') */
export const apiUrl = (path = '') => `${API_BASE}${path}`;
