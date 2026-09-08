#!/usr/bin/env node
'use strict';

const net = require('node:net');
const port = Number(process.argv[2] || 8081);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  console.error('Usage: node scripts/hold-port.js <valid-port>');
  process.exit(1);
}
const server = net.createServer((socket) => {
  socket.on('error', () => {});
  socket.end('Tuvu harmless port-conflict fixture\n');
});
server.on('error', (error) => { console.error(`Could not hold port ${port}: ${error.message}`); process.exit(1); });
server.listen(port, '0.0.0.0', () => console.log(`Harmless listener owns port ${port}. Press Ctrl+C to stop it.`));
