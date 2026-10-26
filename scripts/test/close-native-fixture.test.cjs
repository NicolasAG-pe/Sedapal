'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const {once} = require('node:events');
const {Server} = require('../../Backend/node_modules/socket.io');
const closeNativeFixture = require('./close-native-fixture.cjs');

for (const incompleteHeaders of [true, false]) {
  test('cierre nativo libera HTTP retenido: ' + (incompleteHeaders ? 'cabeceras incompletas' : 'petición pendiente'), {timeout: 5000}, async t => {
    const server = http.createServer(() => {});
    const io = new Server(server);
    let closed = false;
    const ctx = {httpServer: server, async close() {
      await new Promise(resolve => io.close(resolve));
      closed = true;
    }};
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const connection = once(server, 'connection');
    const client = net.connect(server.address().port, '127.0.0.1');
    const errors = [];
    client.on('error', error => errors.push(error.code));
    t.after(() => {client.destroy(); server.closeAllConnections(); server.close();});
    await once(client, 'connect');
    await connection;
    const accepted = incompleteHeaders ? null : once(server, 'request');
    client.write('GET /held HTTP/1.1\r\nHost: localhost\r\n' + (incompleteHeaders ? '' : '\r\n'));
    if (accepted) await accepted;
    const disconnected = new Promise(resolve => client.once('close', resolve));
    await closeNativeFixture(ctx);
    await disconnected;
    assert.equal(closed, true);
    assert.equal(server.listening, false);
    assert.equal(io.engine.clientsCount, 0);
    assert.ok(errors.every(code => code === 'ECONNRESET'), 'Solo se admite el reset del cierre intencional');
  });
}
