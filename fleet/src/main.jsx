import { mountApp } from '@shared/app/mountApp';
import { store } from '@shared/store';
import FleetApp from './app/FleetApp';
import '@shared/styles/index.css';

mountApp({ App: FleetApp, store, roles: ['admin'], toastPosition: 'top-right' });
