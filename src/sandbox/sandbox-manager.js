const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const eventStore = require('../state/event-store');
const stateManager = require('../state/state-manager');

class SandboxManager {
  constructor() {
    this.containers = new Map();
  }

  /**
   * Spawns an ephemeral Docker container for World: Subject.
   * Enforces Invariant 10 and Section 16 isolation.
   */
  async spawn(projectRoot, config = {}) {
    stateManager.checkpoint('subject');
    
    const containerName = `mbo-sandbox-${crypto.randomBytes(4).toString('hex')}`;
    const image = config.image || 'node:18-slim';
    
    // Section 16: Isolation Contract
    const dockerArgs = [
      'run', '-d',
      '--name', containerName,
      '--network', 'none', // Restricted network
      '--memory', config.memory || '1g',
      '--cpus', config.cpus || '1.0',
      '-v', `${path.resolve(projectRoot)}:/project:ro`, // Read-only source
      '-v', `${path.resolve(projectRoot)}/data:/project/data:rw`, // Read-write data
      '--workdir', '/project',
      image, 'tail', '-f', '/dev/null'
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('docker', dockerArgs);
      proc.on('close', (code) => {
        if (code === 0) {
          this.containers.set(containerName, { worldId: 'subject', projectRoot });
          eventStore.append('SANDBOX_SPAWN', 'sandbox-manager', { containerName, image }, 'subject');
          resolve(containerName);
        } else {
          reject(new Error(`Docker spawn failed with code ${code}`));
        }
      });
    });
  }

  async exec(containerName, command, args = []) {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['exec', containerName, command, ...args]);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('close', (code) => {
        eventStore.append('SANDBOX_EXEC', 'sandbox-manager', { command, code, stderr: stderr.slice(0, 500) }, 'subject');
        resolve({ code, stdout, stderr });
      });
    });
  }

  async teardown(containerName) {
    return new Promise((resolve) => {
      spawn('docker', ['rm', '-f', containerName]).on('close', () => {
        this.containers.delete(containerName);
        eventStore.append('SANDBOX_TEARDOWN', 'sandbox-manager', { containerName }, 'subject');
        resolve();
      });
    });
  }
}

module.exports = new SandboxManager();
