// The part of qrcode the collect card uses (the package ships no types).
declare module 'qrcode' {
  const QRCode: { create(text: string, opts?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): { modules: { size: number; get(x: number, y: number): number | boolean } } };
  export default QRCode;
}
