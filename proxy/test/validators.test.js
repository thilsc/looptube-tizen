const test = require('node:test');
const assert = require('node:assert/strict');

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const PLAYLIST_ID_RE = /^[a-zA-Z0-9_-]+$/;

test('valida ID de vídeo (11 chars)', () => {
  assert.equal(VIDEO_ID_RE.test('dQw4w9WgXcQ'), true);
  assert.equal(VIDEO_ID_RE.test('short'), false);
  assert.equal(VIDEO_ID_RE.test('has spaces!!'), false);
  assert.equal(VIDEO_ID_RE.test(''), false);
});

test('valida ID de playlist', () => {
  assert.equal(PLAYLIST_ID_RE.test('PLw35prD_PecItXU8QwU7dKDBqeGkYDbsQ'), true);
  assert.equal(PLAYLIST_ID_RE.test(''), false);
  assert.equal(PLAYLIST_ID_RE.test('bad/id'), false);
});
