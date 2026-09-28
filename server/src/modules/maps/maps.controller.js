'use strict';

const gmaps = require('./google-maps.service');

// Reverse Geocode
// GET /api/maps/reverse-geocode?lat=...&lng=...
async function reverseGeocode(req, res) {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, message: 'lat and lng are required numbers' });
  }
  try {
    const data = await gmaps.reverseGeocode(lat, lng);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// Forward Geocode
// GET /api/maps/geocode?address=...
async function geocode(req, res) {
  const { address } = req.query;
  if (!address) return res.status(400).json({ success: false, message: 'address is required' });
  try {
    const data = await gmaps.geocodeAddress(address);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// Route / Directions
// GET /api/maps/route?fromLat=...&fromLng=...&toLat=...&toLng=...
async function getRoute(req, res) {
  const fromLat = parseFloat(req.query.fromLat);
  const fromLng = parseFloat(req.query.fromLng);
  const toLat   = parseFloat(req.query.toLat);
  const toLng   = parseFloat(req.query.toLng);

  if ([fromLat, fromLng, toLat, toLng].some(isNaN)) {
    return res.status(400).json({ success: false, message: 'fromLat, fromLng, toLat, toLng are required' });
  }
  try {
    const data = await gmaps.getDirections(fromLat, fromLng, toLat, toLng);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ETA
// GET /api/maps/eta?fromLat=...&fromLng=...&toLat=...&toLng=...
async function getEta(req, res) {
  const fromLat = parseFloat(req.query.fromLat);
  const fromLng = parseFloat(req.query.fromLng);
  const toLat   = parseFloat(req.query.toLat);
  const toLng   = parseFloat(req.query.toLng);

  if ([fromLat, fromLng, toLat, toLng].some(isNaN)) {
    return res.status(400).json({ success: false, message: 'fromLat, fromLng, toLat, toLng are required' });
  }
  try {
    const data = await gmaps.getDistanceMatrix(fromLat, fromLng, toLat, toLng);
    res.json({
      success: true,
      data: {
        ...data,
        etaMinutes: Math.max(1, Math.ceil(data.durationInTrafficSeconds / 60)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// Places Autocomplete
// GET /api/maps/autocomplete?input=...&lat=...&lng=...
async function autocomplete(req, res) {
  const { input } = req.query;
  if (!input) return res.status(400).json({ success: false, message: 'input is required' });

  const lat    = parseFloat(req.query.lat)   || null;
  const lng    = parseFloat(req.query.lng)   || null;
  const radius = parseInt(req.query.radius)  || 50000;

  try {
    const data = await gmaps.placesAutocomplete(input, lat, lng, radius);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// Place Details
// GET /api/maps/place?placeId=...
async function placeDetail(req, res) {
  const { placeId } = req.query;
  if (!placeId) return res.status(400).json({ success: false, message: 'placeId is required' });
  try {
    const data = await gmaps.getPlaceDetails(placeId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// Static Map URL
// GET /api/maps/static?lat=...&lng=...&zoom=...&width=...&height=...
function staticMap(req, res) {
  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, message: 'lat and lng are required' });
  }
  try {
    const url = gmaps.buildStaticMapUrl(
      { lat, lng },
      {
        zoom    : parseInt(req.query.zoom)   || 16,
        width   : parseInt(req.query.width)  || 400,
        height  : parseInt(req.query.height) || 300,
        maptype : req.query.maptype || 'roadmap',
      },
    );
    res.json({ success: true, data: { url } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { reverseGeocode, geocode, getRoute, getEta, autocomplete, placeDetail, staticMap };
