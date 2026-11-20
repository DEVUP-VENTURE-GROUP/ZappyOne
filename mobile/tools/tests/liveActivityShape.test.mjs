// The Live Activity shape lives in three places that must agree: the Swift module, the widget extension, and the server's JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const moduleCopy = read('../../packages/native/ios/LiveActivity/JobActivityAttributes.swift');
const widgetCopy = read('../../apps/customer/targets/job-activity/JobActivityAttributes.swift');

test('the app module and the widget define the same attributes', () => {
  assert.equal(widgetCopy, moduleCopy);
});

test('the server sends exactly the fields Swift decodes', () => {
  const state = moduleCopy.slice(moduleCopy.indexOf('struct ContentState'), moduleCopy.indexOf('public var jobId'));
  const swiftFields = [...state.matchAll(/public var (\w+):/g)].map((m) => m[1]).sort();
  const require = createRequire(import.meta.url);
  const { stateFor } = require('../../../server/src/modules/notification/live-activity.js');
  const serverFields = Object.keys(stateFor('repair', { status: 'ON_THE_WAY' })).sort();
  assert.deepEqual(serverFields, swiftFields);
});
