import { mountApp } from '@shared/app/mountApp';
import { store } from '@shared/store';
import App from './App';
import { setPayQrDrawer } from '@shared/components/common/payQrSlot';
import PayQr from './shell/PayQr';
import '@shared/styles/index.css';

setPayQrDrawer(PayQr);
mountApp({ App, store, roles: ['shop', 'worker'] });
