// The scan-to-pay QR is drawn by an app that ships a QR library (ServicePro registers one at start); elsewhere the UPI ID shows alone.
import type { ComponentType } from 'react';

export type PayQrProps = { value: string; size: number; label: string };
let drawer: ComponentType<PayQrProps> | null = null;
export const setPayQrDrawer = (Component: ComponentType<PayQrProps>) => { drawer = Component; };
export const payQrDrawer = () => drawer;
