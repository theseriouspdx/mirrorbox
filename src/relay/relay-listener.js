// §24: Cross-World Event Streaming — Mirror-Side UDS Listener

const net = require('net');
const path = require('path');
const fs = require('fs');
const eventStore = require('../state/event-store');
const guard = require('./guard');

const RELAY_SOCK = path.join(__dirname, '../../.dev/run/relay.sock');
const INCIDENT_FLAG = path.join(__dirname, '../../.dev/run/incident.flag');

class RelayListener {
  constructor() {
    this.server = null;
    this.activeSocket = null;
    this._lastSeq = 0;
  }

  start(taskId, approvedFiles, merkleRoot) {
    // §24.7: unlink stale socket before binding
    if (fs.existsSync(RELAY_SOCK)) fs.unlinkSync(RELAY_SOCK);

    // Initialize Guard with task context
    guard.setContext({ taskId, approvedFiles, merkleRoot });

    this.server = net.createServer((socket) => {
      if (this.activeSocket) { socket.destroy(); return; }
      this.activeSocket = socket;
      this._lastSeq = 0;

      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (line.trim()) this._handlePacket(line, socket);
        }
      });

      socket.on('close', () => {
        this.activeSocket = null;
        eventStore.append('RELAY_CLOSED', 'relay-listener', {}, 'mirror');
      });

      socket.on('error', (err) => {
        this.activeSocket = null;
        eventStore.append('RELAY_ERROR', 'relay-listener', { error: err.message }, 'mirror');
      });
    });

    this.server.listen(RELAY_SOCK, () => {
      fs.chmodSync(RELAY_SOCK, 0o600);
      console.error(`[Relay] Listening at ${RELAY_SOCK}`);
    });
  }

  _handlePacket(line, socket) {
    let packet;
    try { packet = JSON.parse(line); }
    catch (e) {
      this._violate(socket, { rule: 7, reason: `JSON parse failure: ${e.message}` });
      return;
    }

    const result = guard.validate(packet, this._lastSeq);
    if (!result.ok) { this._violate(socket, result); return; }

    this._lastSeq = packet.seq;
    eventStore.append(packet.event, packet.actor, packet.payload, 'subject');
  }

  _violate(socket, result) {
    fs.writeFileSync(INCIDENT_FLAG, JSON.stringify({
      ts: new Date().toISOString(), rule: result.rule, reason: result.reason
    }));
    socket.destroy();
    this.activeSocket = null;
    eventStore.append('SECURITY_VIOLATION', 'relay-listener', result, 'mirror');
  }

  stop() {
    if (this.activeSocket) this.activeSocket.destroy();
    if (this.server) this.server.close(() => {
      if (fs.existsSync(RELAY_SOCK)) fs.unlinkSync(RELAY_SOCK);
    });
  }
}

module.exports = new RelayListener();
