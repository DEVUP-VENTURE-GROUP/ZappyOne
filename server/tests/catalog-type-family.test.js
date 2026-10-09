/**
 * Laptop catalog: models carry their type through their family. Picking a type
 * must list the brand's models of that type; a brand only offers the types it
 * makes; a brand with no models is not offered at all.
 */
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let ctrl;
const call = (fn, req) => new Promise((resolve, reject) => fn(req, { json: resolve, status: () => ({ json: resolve }) }, reject));
const q = (query, params = {}) => ({ query: { vertical: 'laptop', ...query }, params, auth: {} });

beforeAll(async () => {
  await startMongo();
  const Brand = require('../src/modules/service/brand.model');
  const DeviceModel = require('../src/modules/service/device-model.model');
  const { ProductType, ProductFamily } = require('../src/modules/repair/models/catalog.model');
  const [apple] = await Brand.create([
    { code: 'apple-laptop', name: 'Apple / MacBook', category: 'laptop', isActive: true },
    { code: 'apple-mac', name: 'Apple Mac', category: 'laptop', isActive: true }, // no models
  ]);
  await ProductType.create([
    { code: 'macbook', name: 'MacBook', vertical: 'laptop', isActive: true },
    { code: 'gaming_laptop', name: 'Gaming laptop', vertical: 'laptop', isActive: true },
  ]);
  await ProductFamily.create({ code: 'macbook-air', name: 'MacBook Air', brandCode: 'apple-laptop', productTypeCode: 'macbook', vertical: 'laptop', isActive: true });
  await DeviceModel.create([
    { code: 'mba-m1', name: 'MacBook Air M1', brandId: apple._id, brandCode: 'apple-laptop', familyCode: 'macbook-air', vertical: 'laptop', isActive: true },
    { code: 'mba-m2', name: 'MacBook Air M2', brandId: apple._id, brandCode: 'apple-laptop', familyCode: 'macbook-air', vertical: 'laptop', isActive: true },
  ]);
  ctrl = require('../src/modules/repair/controllers/catalog.controller');
});
afterAll(stopMongo);

test('a brand with no models is not offered', async () => {
  const { brands } = await call(ctrl.listBrands, q({}));
  expect(brands.map((b) => b.code)).toEqual(['apple-laptop']);
});

test('a brand only offers the types it makes', async () => {
  const { productTypes } = await call(ctrl.listProductTypes, q({ brandCode: 'apple-laptop' }));
  expect(productTypes.map((t) => t.code)).toEqual(['macbook']);
});

test('picking a type lists the models of that type through their family; search still works', async () => {
  expect((await call(ctrl.listModels, q({ productTypeCode: 'macbook' }, { brandCode: 'apple-laptop' }))).total).toBe(2);
  expect((await call(ctrl.listModels, q({ productTypeCode: 'gaming_laptop' }, { brandCode: 'apple-laptop' }))).total).toBe(0);
  expect((await call(ctrl.listModels, q({ productTypeCode: 'macbook', q: 'm2' }, { brandCode: 'apple-laptop' }))).total).toBe(1);
});
