const readline = require('readline');
const { Operator } = require('./auth/operator');

async function main() {
  const operator = new Operator('runtime');
  await operator.startMCP();
  console.log("MBO Engine v0.1.0 initialized.");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

  rl.on('line', async (line) => {
    const result = await operator.processMessage(line.trim());
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  });

  rl.on('close', async () => {
    await operator.shutdown();
  });
}

main().catch(console.error);
