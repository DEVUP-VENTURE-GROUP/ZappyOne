// A media reference a client may send: a key in one of our upload folders (folder/user/id), never a web address, a script or a path that climbs out.
const Joi = require('joi');

const SAFE = /^(?!.*\.\.)[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/;

function uploadKey(folders) {
  const allowed = folders || require('./upload.routes').UPLOAD_FOLDERS;
  return Joi.string().max(500).pattern(SAFE).custom((v, h) => (allowed.some((f) => v.startsWith(`${f}/`)) ? v : h.error('string.pattern.base')));
}

module.exports = { uploadKey };
