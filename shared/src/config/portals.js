// Where each ZappyOne web app lives. Override per environment with VITE_<NAME>_URL.
const env = import.meta.env;
const pick = (override, prod, devPort) => override || (env.PROD ? prod : `http://localhost:${devPort}`);

export const PORTAL_URLS = {
  customer: pick(env.VITE_CUSTOMER_URL, 'https://www.zappyone.com', 5173),
  admin: pick(env.VITE_ADMIN_URL, 'https://admin.zappyone.com', 5174),
  servicepro: pick(env.VITE_SERVICEPRO_URL, 'https://servicepro.zappyone.com', 5175),
  rakshak: pick(env.VITE_RAKSHAK_URL, 'https://rakshak.zappyone.com', 5176),
  events: pick(env.VITE_EVENTS_URL, 'https://events.zappyone.com', 5177),
};
