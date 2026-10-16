// Map tiles for every admin and Fleet map: Mapbox when a token is set, else OpenStreetMap; CARTO's free tiles now need a key.
import L from 'leaflet';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const OSM = { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', options: { maxZoom: 19, attribution: '&copy; OpenStreetMap' } };
const mapbox = (style) => ({
  url: `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/{z}/{x}/{y}@2x?access_token=${TOKEN}`,
  options: { maxZoom: 20, tileSize: 512, zoomOffset: -1, attribution: '&copy; Mapbox &copy; OpenStreetMap' },
});

export const TILES = {
  light: TOKEN ? mapbox('streets-v12') : OSM,
  dark: TOKEN ? mapbox('dark-v11') : OSM,
  satellite: TOKEN ? mapbox('satellite-streets-v12') : { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', options: { maxZoom: 19, attribution: 'Tiles &copy; Esri' } },
};

export const baseLayer = (kind = 'light') => L.tileLayer(TILES[kind].url, TILES[kind].options);
