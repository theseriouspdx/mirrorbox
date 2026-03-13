// §26: The Pile — Mirror → Subject Promotion Engine

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const eventStore = require('../state/event-store');
const stateManager = require('../state/state-manager');
const db = require('../state/db-manager');

const PILE_LOCK = path.join(__dirname, '../../.dev/run/pile.lock');
const MBO_ROOT = path.resolve(__dirname, '../..');
const HANDSHAKE = path.join(MBO_ROOT, 'bin/handshake.py');

class Pile {
  _subjectRoot() {
    const row = db.get('SELECT profile_data FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
    if (!row) throw new Error('[Pile] No onboarding profile — subjectRoot unknown.');
    const data = JSON.parse(row.profile_data);
    if (!data.subjectRoot) throw new Error('[Pile] onboarding profile missing subjectRoot.');
    return data.subjectRoot;
  }

  _merkleRoot(dir) {
    const r = spawnSync('python3', [HANDSHAKE, '--merkle-root', dir], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`[Pile] Merkle computation failed: ${r.stderr}`);
    return r.stdout.trim();
  }

  _normalizeApprovedFiles(approvedFiles) {
    if (!Array.isArray(approvedFiles) || approvedFiles.length === 0) {
      throw new Error('[Pile] approvedFiles is empty; cannot compute Merkle scope.');
    }
    const cleaned = approvedFiles
      .filter((f) => typeof f === 'string' && f.trim().length > 0)
      .map((f) => f.replace(/^\.\//, '').replace(/^\/+/, ''));
    if (cleaned.length === 0) {
      throw new Error('[Pile] approvedFiles contains no valid paths.');
    }
    return Array.from(new Set(cleaned)).sort();
  }

  _hashApprovedFiles(rootDir, approvedFiles) {
    const files = this._normalizeApprovedFiles(approvedFiles);
    const joined = files.join('\n').replace(/'/g, "'\\''");
    const script = [
      'import sys',
      'from pathlib import Path',
      'from handshake import compute_merkle_root',
      `root = Path('${rootDir.replace(/'/g, "'\\''")}').resolve()`,
      `files = '''${joined}'''.splitlines()`,
      'targets = [root / f for f in files]',
      'print(compute_merkle_root(root, base_root=root, file_list=targets))',
    ].join('\n');
    const r = spawnSync('python3', ['-c', script], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONPATH: path.join(MBO_ROOT, 'bin') },
      cwd: MBO_ROOT,
    });
    if (r.status !== 0) {
      throw new Error(`[Pile] Approved-files Merkle computation failed: ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim();
  }

  promote(taskId, approvedFiles) {
    // Step 1: acquire lock
    if (fs.existsSync(PILE_LOCK)) {
      const lock = JSON.parse(fs.readFileSync(PILE_LOCK, 'utf8'));
      throw new Error(`[Pile] Lock held by task ${lock.taskId} since ${lock.ts}`);
    }
    fs.writeFileSync(PILE_LOCK, JSON.stringify({ taskId, ts: new Date().toISOString() }));

    const subjectRoot = this._subjectRoot();
    const cpPath = `${subjectRoot}/.pile-cp-${Date.now()}`;

    try {
      // Step 2: quiesce — pre-mutation checkpoint
      stateManager.checkpoint('mirror');

      // Step 3: Merkle baseline over approved files only (SPEC scope contract).
      const normalizedApproved = this._normalizeApprovedFiles(approvedFiles);
      const preMerkle = this._hashApprovedFiles(MBO_ROOT, normalizedApproved);

      // Step 5: checkpoint subject
      const cpResult = spawnSync('rsync', ['--archive', '--link-dest', subjectRoot, `${subjectRoot}/`, `${cpPath}/`], { encoding: 'utf8' });
      if (cpResult.status !== 0) throw new Error(`[Pile] Checkpoint failed: ${cpResult.stderr}`);

      // Step 6: promote approved files
      const includes = approvedFiles.flatMap(f => ['--include', f]);
      const rsync = spawnSync('rsync', [
        '--checksum', '--archive', ...includes, '--exclude=*', `${MBO_ROOT}/`, `${subjectRoot}/`
      ], { encoding: 'utf8' });
      if (rsync.status !== 0) throw new Error(`[Pile] rsync failed: ${rsync.stderr}`);

      // Step 7: verify Merkle over the same approved-file scope in Subject.
      const postMerkle = this._hashApprovedFiles(subjectRoot, normalizedApproved);
      if (postMerkle !== preMerkle) {
        this._rollback(subjectRoot, cpPath, taskId);
        throw new Error('[Pile] Merkle mismatch post-promotion. Rolled back.');
      }

      // Step 8: release lock + emit
      fs.unlinkSync(PILE_LOCK);
      fs.rmSync(cpPath, { recursive: true, force: true });
      eventStore.append('PILE_PROMOTED', 'pile', { taskId, approvedFiles, merkleRoot: postMerkle }, 'mirror');
      return { ok: true, merkleRoot: postMerkle };

    } catch (e) {
      if (fs.existsSync(PILE_LOCK)) fs.unlinkSync(PILE_LOCK);
      throw e;
    }
  }

  _rollback(subjectRoot, cpPath, taskId) {
    spawnSync('rsync', ['--archive', '--delete', `${cpPath}/`, `${subjectRoot}/`], { encoding: 'utf8' });
    fs.rmSync(cpPath, { recursive: true, force: true });
    eventStore.append('PILE_FAILED', 'pile', { taskId, reason: 'merkle_mismatch' }, 'mirror');
  }
}

module.exports = new Pile();
