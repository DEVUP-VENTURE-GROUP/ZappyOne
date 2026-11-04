// Where providers are, as H3 hexagons on the same grid as jobs/surge zones: each provider is stored under its cell, and a customer's search reads the cells around them, nearest ring first.
const h3 = require('h3-js');

const RES = 8;
// Centre-to-centre distance between neighbouring cells, so a radius in km becomes a number of rings.
const STEP_KM = h3.getHexagonEdgeLengthAvg(RES, 'km') * Math.sqrt(3);

/** The cell a [lng, lat] point is in, or null for a missing or bad point. */
function cellOf(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const [lng, lat] = coords.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  try { return h3.latLngToCell(lat, lng, RES); } catch { return null; }
}

/** Rings needed to reach `km` from a cell, with one ring spare so nothing at the edge is missed. */
const ringsFor = (km) => Math.ceil(km / STEP_KM) + 1;

// Pure geometry (which cells surround a cell), so it is remembered; no provider data is ever kept here.
const disks = new Map();
/** Every cell within `km` of a point: the search area, read from the index in one query. */
function cellsWithin(lng, lat, km) {
  const at = cellOf([lng, lat]);
  if (!at) return [];
  const key = `${at}:${ringsFor(km)}`;
  let cells = disks.get(key);
  if (!cells) {
    cells = h3.gridDisk(at, ringsFor(km));
    if (disks.size > 2000) disks.delete(disks.keys().next().value);
    disks.set(key, cells);
  }
  return cells;
}

/**
 * Keep `field` equal to the cell of the point at `path` whenever the point is
 * saved, however it is written (save, updateOne, findOneAndUpdate, a whole
 * parent object or the point alone), so the index is never out of step.
 */
function indexOn(schema, { path, field }) {
  const parent = path.split('.')[0];
  const read = (obj, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const pointIn = (set) => {
    if (!set) return undefined;
    if (set[path] !== undefined) return set[path];
    if (set[`${path}.coordinates`] !== undefined) return { coordinates: set[`${path}.coordinates`] };
    if (parent !== path && set[parent] !== undefined) return read(set[parent], path.slice(parent.length + 1)) ?? null;
    return undefined;
  };
  schema.pre('save', function index() {
    if (this.isNew || this.isModified(path)) this.set(field, cellOf(read(this, path)?.coordinates));
  });
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function index() {
    const u = this.getUpdate() || {};
    const point = pointIn(u.$set) ?? pointIn(u);
    if (point === undefined) return;
    const cell = cellOf(point?.coordinates);
    this.setUpdate({ ...u, $set: { ...(u.$set || {}), [field]: cell } });
  });
}

module.exports = { RES, STEP_KM, cellOf, cellsWithin, ringsFor, indexOn };
