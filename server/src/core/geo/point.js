/**
 * GeoJSON points that never half-exist.
 *
 * THE BUG THIS EXISTS TO KILL has shown up in three different shapes, all from
 * the same root: `type` and `coordinates` being allowed to disagree.
 *
 *   1. `{ type: 'Point' }` with no coordinates — because `type` had a default
 *      and `coordinates` did not. The index rejects it:
 *        "Point must be an array or object, instead got type missing"
 *
 *   2. `{ type: 'Point', coordinates: [] }` — same cause, empty-array flavour.
 *
 *   3. `{ coordinates: [lng, lat] }` with no type — the mirror image, which
 *      appears once you remove the `type` default to fix (1):
 *        "unknown GeoJSON type: { coordinates: [...] }"
 *
 * So neither half may default on its own. `type` defaults ONLY when real
 * coordinates sit beside it, and `stripEmptyPoints` enforces the same rule on
 * every write path — including an update that sets a PARENT object containing
 * the point, which is how shape (3) slipped through.
 *
 * The invariant, in one line: a point is complete, or it is absent.
 */

/** Is this a usable [lng, lat] pair? */
function hasCoordinates(point) {
  const c = point?.coordinates;
  return Array.isArray(c) && c.length === 2 && c.every((v) => Number.isFinite(v));
}

/**
 * A GeoJSON Point subdocument that stays absent until it has real coordinates.
 *
 * `type` uses a FUNCTION default rather than the literal 'Point', so it appears
 * exactly when coordinates do. A caller can therefore pass bare coordinates and
 * get a valid point, or pass nothing and get no point — and cannot accidentally
 * produce half of one.
 */
function pointField(extra = {}) {
  return {
    type: {
      type: String,
      enum: ['Point'],
      default: function pointTypeDefault() {
        return hasCoordinates(this) ? 'Point' : undefined;
      },
    },
    coordinates: { type: [Number], default: undefined },
    ...extra,
  };
}

/** Complete the point, or return undefined if it cannot be completed. */
function normalise(point) {
  if (point == null) return undefined;
  return hasCoordinates(point) ? { type: 'Point', coordinates: point.coordinates } : undefined;
}

/**
 * Keep the named point paths whole on every save.
 *
 * Runs on validate (covering create/save) and on the update family. The update
 * side handles two cases:
 *
 *   - the point itself is set:      $set: { 'address.location': {...} }
 *   - an ANCESTOR is set:           $set: { address: { location: {...} } }
 *
 * The second is not an edge case — it is how a profile screen naturally sends a
 * whole address — and missing it is what let an untyped point reach the index.
 *
 * @param {import('mongoose').Schema} schema
 * @param {string[]} paths dotted paths, e.g. ['address.location']
 */
function stripEmptyPoints(schema, paths) {
  schema.pre('validate', function normalisePoints(next) {
    for (const path of paths) {
      const point = this.get(path);
      if (point == null) continue;

      if (hasCoordinates(point)) {
        if (point.type !== 'Point') this.set(`${path}.type`, 'Point');
      } else {
        this.set(path, undefined);
      }
    }
    next();
  });

  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function normaliseUpdate(next) {
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return next();

    for (const path of paths) {
      const segments = path.split('.');

      for (const op of ['$set', '$setOnInsert']) {
        const block = update[op];
        if (!block) continue;

        // (a) The point set directly by its full path.
        if (block[path] !== undefined) {
          const fixed = normalise(block[path]);
          if (fixed) {
            block[path] = fixed;
          } else {
            delete block[path];
            update.$unset = { ...(update.$unset || {}), [path]: '' };
          }
        }

        // (b) An ancestor object set wholesale, with the point nested inside.
        for (let depth = segments.length - 1; depth >= 1; depth -= 1) {
          const ancestor = segments.slice(0, depth).join('.');
          const rest = segments.slice(depth);
          const value = block[ancestor];
          if (value === undefined || value === null || typeof value !== 'object') continue;

          // Walk to the point's container inside the ancestor value.
          let container = value;
          for (let i = 0; i < rest.length - 1; i += 1) {
            container = container?.[rest[i]];
            if (!container || typeof container !== 'object') break;
          }
          const leaf = rest[rest.length - 1];
          if (!container || typeof container !== 'object' || container[leaf] === undefined) continue;

          const fixed = normalise(container[leaf]);
          if (fixed) container[leaf] = fixed;
          else delete container[leaf];
        }
      }
    }

    this.setUpdate(update);
    return next();
  });
}

module.exports = { pointField, stripEmptyPoints, hasCoordinates };
