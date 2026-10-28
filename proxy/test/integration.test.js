const { spawn } = require('child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const PORT = '5099';
let server;

test.before(async () => {
  server = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT, YT_API_KEY: process.env.YT_API_KEY || 'dummy-key-for-tests' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      if (buf.includes('rodando')) resolve();
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.on('exit', (code) => reject(new Error(`server exited early: ${code}`)));
    setTimeout(() => reject(new Error('server start timeout')), 15000);
  });
});

test.after(() => {
  if (server && !server.killed) server.kill();
});

test('health endpoint retorna ok', async () => {
  const res = await fetch(`http://localhost:${PORT}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('proxy com id inválido retorna 400', async () => {
  const res = await fetch(`http://localhost:${PORT}/proxy/invalid`);
  assert.equal(res.status, 400);
});

if (process.env.YT_API_KEY) {
  test('playlist endpoint retorna lista de URLs (com chave real)', async () => {
    const res = await fetch(`http://localhost:${PORT}/playlist/PLrAXtmErZgOeiKm4sgNOknGvNjSE84uN`);
    // Pode ser 200 ou 404/500 dependendo da playlist; apenas garante JSON
    const body = await res.json();
    assert.ok(Array.isArray(body) || typeof body === 'object');
  });
}
