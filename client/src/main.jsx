import { mountApp } from '@shared/app/mountApp';
import { store } from '@shared/store';
import App from './app/App';
import { prefetchRoute } from './lib/routePrefetch';
import '@shared/styles/index.css';

// Every other role has its own app; only customer sessions are restored here.
// The opening page downloads while the session is restored, not after.
prefetchRoute(window.location.pathname === '/home' ? '/' : window.location.pathname);
mountApp({ App, store, roles: ['user'] });
