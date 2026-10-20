// One position for a check-in or a photo: GPS first, then the device's normal fix (laptops have no GPS and time out), with a message a person can act on.
const read = (opts) => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
  (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), reject, opts,
));

export const LOCATION_BLOCKED = 'Location is blocked for this site. Click the lock icon next to the address, set Location to Allow, then try again.';
export const LOCATION_UNAVAILABLE = 'Could not find your location. Turn on location (Wi-Fi helps on a laptop) and try again.';

export async function onePosition() {
  if (!navigator.geolocation) throw Object.assign(new Error(LOCATION_UNAVAILABLE), { code: 2 });
  try {
    return await read({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  } catch (err) {
    if (err?.code === 1) throw Object.assign(new Error(LOCATION_BLOCKED), { code: 1 });
    try {
      return await read({ enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 });
    } catch (again) {
      throw Object.assign(new Error(again?.code === 1 ? LOCATION_BLOCKED : LOCATION_UNAVAILABLE), { code: again?.code || 2 });
    }
  }
}
