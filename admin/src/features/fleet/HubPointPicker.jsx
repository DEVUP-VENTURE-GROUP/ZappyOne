import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const HYDERABAD = [17.4239, 78.4738];

/**
 * The hub's meeting point on a map (the same map tiles as Service areas):
 * click to place it; the circle is the check-in radius staff must be inside.
 */
export default function HubPointPicker({ lat, lng, radiusM, onPick }) {
  const box = useRef(null);
  const map = useRef(null);
  const pin = useRef(null);
  const ring = useRef(null);

  useEffect(() => {
    if (!box.current || map.current) return undefined;
    const m = L.map(box.current, { center: lat != null ? [lat, lng] : HYDERABAD, zoom: lat != null ? 15 : 11, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(m);
    m.on('click', (e) => onPick({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) }));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m || lat == null) return;
    const at = [lat, lng];
    if (!pin.current) pin.current = L.circleMarker(at, { radius: 8, color: '#1F4FD8', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(m);
    else pin.current.setLatLng(at);
    if (!ring.current) ring.current = L.circle(at, { radius: radiusM || 200, color: '#1F4FD8', weight: 1, fillOpacity: 0.08 }).addTo(m);
    else { ring.current.setLatLng(at); ring.current.setRadius(radiusM || 200); }
  }, [lat, lng, radiusM]);

  return <div ref={box} className="h-64 w-full overflow-hidden rounded-xl border border-slate-200" aria-label="Map: click to set the meeting point" />;
}
