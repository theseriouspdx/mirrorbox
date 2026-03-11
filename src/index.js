const readline = require('readline');
const { Operator } = require('./auth/operator');

async function main() {
  const operator = new Operator('runtime');
  await operator.startMCP();
  console.log("MBO Engine v0.1.0 initialized. [ctrl+f to focus sandbox]");

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout, 
    terminal: true,
    prompt: 'MBO> '
  });

  rl.prompt();

  process.stdin.on('keypress', (str, key) => {
    // ctrl+f (focus sandbox)
    if (key.ctrl && key.name === 'f') {
      const state = operator.toggleSandboxFocus();
      process.stdout.write(`\n[SYSTEM] Sandbox focus: ${state ? 'ENABLED' : 'DISABLED'}\n`);
      rl.prompt();
    }
    // ctrl+c (exit)
    if (key.ctrl && key.name === 'c') {
      process.exit();
    }
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed && !operator.sandboxFocus) {
      rl.prompt();
      return;
    }

    const result = await operator.processMessage(trimmed);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    rl.prompt();
  });

  rl.on('close', async () => {
    await operator.shutdown();
    process.exit(0);
  });
}

main().catch(console.error);
