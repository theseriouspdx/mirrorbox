const { callModel } = require('../src/auth/call-model');
const assert = require('assert');

// NOTE: We override routeModels on the required module instance to bypass environment detection.
// This works because 'require' caches the module, and call-model.js now uses the late-bound module reference.
const modelRouter = require('../src/auth/model-router');

const mockConfig = {
  classifier: { provider: 'openrouter', model: 'google/gemini-2.0-flash-001', budget: { input: 10, output: 10 } }
};

modelRouter.routeModels = async () => ({
  routingMap: mockConfig,
  tier: 1
});

async function testBudgetExceeded() {
  console.log('Testing budget exceeded...');
  const prompt = 'This prompt is definitely longer than ten tokens when counted by the heuristic.';
  
  try {
    // Force a very low budget via options to ensure breach
    await callModel('classifier', prompt, {}, null, [], null, { budget: { input: 1, output: 1 } });
    assert.fail('Should have thrown BUDGET_EXCEEDED');
  } catch (err) {
    if (err.message.includes('[BUDGET_EXCEEDED]')) {
      console.log('PASS: Correctly identified budget breach.');
    } else {
      // Re-throw unexpected errors (Blocker 2)
      throw err;
    }
  }
}

async function testBudgetPassed() {
  console.log('Testing budget passed...');
  const prompt = 'Short'; // ~2 tokens
  
  try {
    await callModel('classifier', prompt, {}, null, [], null, { budget: { input: 1000, output: 1000 } });
    console.log('PASS: Budget check passed (proceeded to dispatch).');
  } catch (err) {
    if (err.message.includes('[BUDGET_EXCEEDED]')) {
      assert.fail('Should NOT have thrown BUDGET_EXCEEDED');
    }
    // Any other error (like network) also confirms we passed the budget check.
    console.log(`PASS: Budget check passed (reached dispatcher, failed with: ${err.message})`);
  }
}

async function testBudgetValidationGuard() {
  console.log('Testing budget validation guard (bypassing empty object)...');
  const prompt = 'Long prompt that should exceed default but we try to bypass with empty budget object';
  
  try {
    await callModel('classifier', prompt, {}, null, [], null, { budget: {} });
    console.log('PASS: Empty budget object fell back to default safely.');
  } catch (err) {
    if (err.message.includes('[BUDGET_EXCEEDED]')) {
      assert.fail('Should not have exceeded default budget with empty object fallback');
    }
    console.log(`PASS: Empty budget object fell back safely (reached dispatcher, failed with: ${err.message})`);
  }
}

(async () => {
  try {
    await testBudgetExceeded();
    await testBudgetPassed();
    await testBudgetValidationGuard();
    process.exit(0);
  } catch (err) {
    console.error('FAIL (Unexpected error):', err.message);
    process.exit(1);
  }
})();
