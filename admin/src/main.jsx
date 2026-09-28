import { mountApp } from '@shared/app/mountApp';
import { store } from '@shared/store';
import App from './App';
import '@shared/styles/index.css';

mountApp({ App, store, roles: ['admin'], toastPosition: 'top-right' });
