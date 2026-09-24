/**
 * Author: GitHub Copilot
 * Action / Modification: Add isolated scenario result calculation with override and AUTO rule evaluation
 * Timestamp: 2026-09-24T14:29:00+02:00
 * Version: v1.0.0
 */

function normalizeStatus(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) {
        return 'NOT_RUN';
    }
    if (['PASS', 'PASSED', 'P'].includes(normalized)) {
        return 'PASSED';
    }
    if (['FAIL', 'FAILED', 'F'].includes(normalized)) {
        return 'FAILED';
    }
    return normalized;
}

function calculateScenarioResult(scenarioExecutionData = {}) {
    const overrideStatus = String(scenarioExecutionData.OVERRIDE_STATUS || scenarioExecutionData.overrideStatus || '').trim().toUpperCase();
    if (overrideStatus === 'PASS') {
        return {
            verdict: 'PASSED',
            reason: 'Manual override set to PASS',
            totalKeywords: 0,
            passedKeywords: 0,
            failedKeywords: 0,
            lastFourKeywords: [],
        };
    }
    if (overrideStatus === 'FAIL') {
        return {
            verdict: 'FAILED',
            reason: 'Manual override set to FAIL',
            totalKeywords: 0,
            passedKeywords: 0,
            failedKeywords: 0,
            lastFourKeywords: [],
        };
    }

    const inputStatuses = Array.isArray(scenarioExecutionData.keywordStatus)
        ? scenarioExecutionData.keywordStatus
        : Array.isArray(scenarioExecutionData.keywordResults)
            ? scenarioExecutionData.keywordResults
            : Array.isArray(scenarioExecutionData.keywordArray)
                ? scenarioExecutionData.keywordArray
                : [];

    const normalizedStatuses = inputStatuses.map((value) => normalizeStatus(value));
    const totalKeywords = normalizedStatuses.length;
    const passedKeywords = normalizedStatuses.filter((status) => status === 'PASSED').length;
    const failedKeywords = totalKeywords - passedKeywords;
    const lastFourKeywords = normalizedStatuses.slice(-4);
    const mode = String(scenarioExecutionData.MODE || scenarioExecutionData.mode || 'AUTO').trim().toUpperCase();

    if (mode !== 'AUTO') {
        return {
            verdict: totalKeywords > 0 && passedKeywords === totalKeywords ? 'PASSED' : 'FAILED',
            reason: 'Non-AUTO mode fallback',
            totalKeywords,
            passedKeywords,
            failedKeywords,
            lastFourKeywords,
        };
    }

    const majorityPassed = totalKeywords > 0 && passedKeywords > totalKeywords / 2;
    const lastFourPassed = lastFourKeywords.length > 0 && lastFourKeywords.every((status) => status === 'PASSED');
    const verdict = majorityPassed && lastFourPassed ? 'PASSED' : 'FAILED';

    return {
        verdict,
        reason: verdict === 'PASSED'
            ? 'AUTO rule passed majority and last four keywords'
            : 'AUTO rule failed due to majority or last-four check',
        totalKeywords,
        passedKeywords,
        failedKeywords,
        lastFourKeywords,
    };
}

module.exports = {
    calculateScenarioResult,
    normalizeStatus,
};
