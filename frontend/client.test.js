import test from 'node:test';
import assert from 'node:assert/strict';
import { request, chartGeometry } from './src/api.js';
test('temporary 503 retries and returns successful data', async () => {
 let calls = 0;
 const data = await request('/api/test', undefined, async () => ++calls < 2 ? { ok:false, status:503 } : { ok:true, json:async () => ({ data:[1] }) });
 assert.equal(calls,2); assert.deepEqual(data,{ data:[1] });
});
test('non-retryable errors stop immediately', async () => {
 let calls = 0;
 await assert.rejects(request('/api/test',undefined,async()=>{calls++;return {ok:false,status:404};}));
 assert.equal(calls,1);
});
test('abort interrupts pending retry', async () => {
 const controller = new AbortController();
 const result = request('/api/test',controller.signal,async()=>{controller.abort();return {ok:false,status:503};});
 await assert.rejects(result,{ name:'AbortError' });
});
test('flat and single readings produce finite chart coordinates', () => {
 for (const input of [[{value:2}], [{value:2},{value:2}], [{value:0},{value:.01}]]) {
  const geometry = chartGeometry(input);
  assert.ok(geometry.max > geometry.min); assert.doesNotMatch(geometry.points,/NaN|Infinity/);
 }
});
test('chart sorts newest-first API readings into chronological display without mutation', () => {
 const input = [{value:3,id:'new'},{value:2,id:'old'}];
 assert.equal(chartGeometry(input).values[0].id,'old'); assert.equal(input[0].id,'new');
});
