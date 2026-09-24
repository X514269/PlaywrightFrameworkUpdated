/**
 * Author: GitHub Copilot
 * Action / Modification: Add regression tests for the scenario result calculator before implementing the helper
 * Timestamp: 2026-09-24T14:29:00+02:00
 * Version: v1.0.0
 */

const assert = require('assert');
const { calculateScenarioResult } = require('../HelperClasses/scenarioEvaluationService');

const manualPass = calculateScenarioResult({ OVERRIDE_STATUS: 'PASS', keywordStatus: ['FAILED'] });
assert.strictEqual(manualPass.verdict, 'PASSED');

const manualFail = calculateScenarioResult({ OVERRIDE_STATUS: 'FAIL', keywordStatus: ['PASSED'] });
assert.strictEqual(manualFail.verdict, 'FAILED');

const autoPass = calculateScenarioResult({ MODE: 'AUTO', keywordStatus: ['FAILED', 'PASSED', 'PASSED', 'PASSED', 'PASSED'] });
assert.strictEqual(autoPass.verdict, 'PASSED');

const autoFail = calculateScenarioResult({ MODE: 'AUTO', keywordStatus: ['PASSED', 'FAILED', 'PASSED', 'FAILED', 'PASSED'] });
assert.strictEqual(autoFail.verdict, 'FAILED');

console.log('scenarioEvaluationService tests passed');
