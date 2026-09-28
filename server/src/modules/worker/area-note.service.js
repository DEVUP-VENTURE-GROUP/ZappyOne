/**
 * Neighborhood Safety Trust Map
 * Workers submit anonymous area notes. Aggregated into geobuckets.
 * Shown on booking page and demand zones — community-sourced safety intel.
 */
const AreaNote = require('./area-note.model');
const logger   = require('../../core/logger');

function geohash(lat, lng) {
  return `${(Math.round(lat * 100) / 100).toFixed(2)}:${(Math.round(lng * 100) / 100).toFixed(2)}`;
}

async function submitNote({ workerId, lat, lng, kind, note }) {
  const hash = geohash(lat, lng);
  const bucketLat = Math.round(lat * 100) / 100;
  const bucketLng = Math.round(lng * 100) / 100;

  const inc = {
    totalNotes: 1,
    safeCount:        kind === 'safe'         ? 1 : 0,
    cautionCount:     kind === 'caution'      ? 1 : 0,
    accessIssueCount: kind === 'access_issue' ? 1 : 0,
  };

  const update = {
    $inc: inc,
    $set: { lastUpdatedAt: new Date(), lat: bucketLat, lng: bucketLng },
  };

  if (note?.trim()) {
    update.$push = {
      recentNotes: {
        $each:  [{ text: note.slice(0, 150), at: new Date() }],
        $slice: -3,   // keep last 3 notes
      },
    };
  }

  await AreaNote.findOneAndUpdate(
    { geohash: hash },
    { ...update, $setOnInsert: { geohash: hash } },
    { upsert: true, new: true }
  );

  logger.info({ workerId, lat, lng, kind }, '[AreaNote] Note submitted');
  return { ok: true };
}

async function getAreaNotes({ lat, lng, radiusKm = 3 }) {
  /* Fetch all buckets within ~radiusKm (rough bounding box) */
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));

  const notes = await AreaNote.find({
    lat: { $gte: lat - latDelta, $lte: lat + latDelta },
    lng: { $gte: lng - lngDelta, $lte: lng + lngDelta },
    totalNotes: { $gte: 2 },  // only show if at least 2 workers noted it
  }).lean();

  return notes.map(n => {
    const total    = n.totalNotes || 1;
    const safeRate = Math.round((n.safeCount / total) * 100);
    let trustLevel;
    if (safeRate >= 70) trustLevel = 'trusted';
    else if (safeRate >= 40) trustLevel = 'neutral';
    else trustLevel = 'caution';

    return {
      lat:       n.lat,
      lng:       n.lng,
      trustLevel,
      safeRate,
      totalNotes: n.totalNotes,
      recentNote: n.recentNotes?.[n.recentNotes.length - 1]?.text || null,
    };
  });
}

module.exports = { submitNote, getAreaNotes };
