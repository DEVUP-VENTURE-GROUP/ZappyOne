import { mountApp } from '@shared/app/mountApp';
import { store } from '@shared/store';
import App from './app/App';
import '@shared/styles/index.css';

// Every other role has its own app; only customer sessions are restored here.
mountApp({ App, store, roles: ['user'] });
