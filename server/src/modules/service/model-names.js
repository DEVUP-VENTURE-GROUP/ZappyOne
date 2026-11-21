// A booking's device by its model name ("Geyser", "Galaxy S23"), never its catalog codes; one query for a whole list.
const DeviceModel = require('./device-model.model');

const keyOf = (vertical, code) => `${vertical}:${code}`;

async function modelNames(rows) {
  const codes = [...new Set(rows.map((r) => r.modelCode).filter(Boolean))];
  if (!codes.length) return new Map();
  const found = await DeviceModel.find({ code: { $in: codes } }).select('code vertical name').lean();
  return new Map(found.map((d) => [keyOf(d.vertical, d.code), d.name]));
}

async function modelNameOf(row) {
  if (!row?.modelCode) return null;
  return (await modelNames([row])).get(keyOf(row.vertical, row.modelCode)) || null;
}

module.exports = { modelNames, modelNameOf, keyOf };
