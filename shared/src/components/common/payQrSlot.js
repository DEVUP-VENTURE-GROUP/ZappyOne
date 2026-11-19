// The scan-to-pay QR is drawn by an app that ships a QR library (ServicePro registers one at start); elsewhere the UPI ID shows alone.
let drawer = null;
export const setPayQrDrawer = (Component) => { drawer = Component; };
export const payQrDrawer = () => drawer;
