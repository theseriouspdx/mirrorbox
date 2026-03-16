// §24: Cross-World Event Streaming — Subject-Side UDS Emitter
// Connects to Mirror's relay socket and sends canonically-formed event packets.
// world_id is always 'subject'. seq is monotonic per connection.

const net = require('net');
const path = require('path');
const fs = require('fs');

// Socket path resolution: MBO_RELAY_SOCK env > .mbo/config.json relaySocket > error.
function _resolveSocketPath() {
  if (process.env.MBO_RELAY_SOCK) return process.env.MBO_RELAY_SOCK;
  const cfgPath = path.join(process.cwd(), '.mbo', 'config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.relaySocket) return cfg.relaySocket;
    } catch (_) { /* fall through to error */ }
  }
  throw new Error('[RelayEmitter] No relay socket configured. Set MBO_RELAY_SOCK or .mbo/config.json relaySocket.');
}

class RelayEmitter {
  constructor() {
    this._socket = null;
    this._seq = 0;
    this._taskId = null;
    this._merkleRoot = null;
  }

  /**
   * Connect to Mirror's UDS relay socket for a given task.
   * Must be called before any emit(). Resolves when connected.
   */
  connect(taskId, merkleRoot) {
    return new Promise((resolve, reject) => {
      this._taskId = taskId;
      this._merkleRoot = merkleRoot;
      this._seq = 0;

      const sockPath = _resolveSocketPath();
      const socket = net.createConnection(sockPath, () => {
        this._socket = socket;
        resolve();
      });

      socket.on('error', (err) => {
        this._socket = null;
        reject(new Error(`[RelayEmitter] Connection failed: ${err.message}`));
      });

      socket.on('close', () => { this._socket = null; });
    });
  }

  /**
   * Emit a single event packet to Mirror.
   * @param {string} event   - Event name (e.g. 'FILE_WRITTEN')
   * @param {string} actor   - Originating component (e.g. 'subject-runtime')
   * @param {object} payload - Arbitrary structured data (no governance paths)
   */
  emit(event, actor, payload = {}) {
    if (!this._socket) throw new Error('[RelayEmitter] Not connected. Call connect() first.');
    this._seq += 1;
    const packet = {
      event,
      actor,
      world_id:     'subject',
      task_id:      this._taskId,
      seq:          this._seq,
      ts:           new Date().toISOString(),
      merkle_root:  this._merkleRoot,
      payload,
    };
    this._socket.write(JSON.stringify(packet) + '\n');
  }

  /**
   * Gracefully close the connection.
   */
  disconnect() {
    if (this._socket) {
      this._socket.end();
      this._socket = null;
    }
    this._seq = 0;
    this._taskId = null;
    this._merkleRoot = null;
  }
}

module.exports = new RelayEmitter();
