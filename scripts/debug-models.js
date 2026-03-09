const { routeModels } = require('../src/auth/model-router');
const { callModel } = require('../src/auth/call-model');

async function debug() {
  console.log("--- MBO Model Detection Debug ---");
  const { routingMap, providers } = await routeModels();
  
  console.log("Providers Detected:");
  console.log(JSON.stringify(providers, null, 2));
  
  console.log("\nRouting Map:");
  console.log(JSON.stringify(routingMap, null, 2));

  console.log("\nTesting callModel('classifier', 'Hello')...");
  try {
    const response = await callModel('classifier', 'Return exactly the string "OK"');
    console.log(`Response: ${response}`);
  } catch (e) {
    console.error(`Call failed: ${e.message}`);
  }
}

debug().catch(console.error);
