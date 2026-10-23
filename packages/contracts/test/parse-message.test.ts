import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCloudMessage, parseRobotMessage } from '../src/index.ts';

const sentAt = '2026-10-22T13:00:00.000-03:00';
const id = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('parseRobotMessage', () => {
  it('parses a known message', () => {
    const result = parseRobotMessage({ type: 'ping', id, sentAt, payload: {} });
    assert.equal(result.kind, 'ok');
  });

  it('reports an unknown type without failing', () => {
    const result = parseRobotMessage({ type: 'battery.health', sentAt, payload: { level: 'ok' } });
    assert.deepEqual(result, { kind: 'unknown', type: 'battery.health' });
  });

  it('reports a known type with a bad payload as invalid', () => {
    const result = parseRobotMessage({ type: 'telemetry', sentAt, payload: { battery: 200 } });
    assert.equal(result.kind, 'invalid');
  });

  it('reports a message without the envelope as invalid', () => {
    assert.equal(parseRobotMessage('ping').kind, 'invalid');
    assert.equal(parseRobotMessage({ type: 'ping' }).kind, 'invalid');
  });
});

describe('parseCloudMessage', () => {
  it('treats robot-only messages as unknown', () => {
    const result = parseCloudMessage({ type: 'hello', sentAt, payload: {} });
    assert.deepEqual(result, { kind: 'unknown', type: 'hello' });
  });

  it('parses a pong', () => {
    assert.equal(parseCloudMessage({ type: 'pong', id, sentAt, payload: {} }).kind, 'ok');
  });
});
