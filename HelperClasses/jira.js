/**
 * Author: GitHub Copilot
 * Action / Modification: Add dynamic Jira target key resolution, evidence naming, and summary comment helpers without changing the existing attachment logic
 * Timestamp: 2026-09-24T14:29:00+02:00
 * Version: v1.0.0
 */

const fs = require('fs');
const path = require('path');

// Reads values from the .env file if present so Jira credentials are available without hardcoding secrets.
function loadDotEnv(filePath = path.resolve(__dirname, '../.env')) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const envValues = {};
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
            continue;
        }

        const splitIndex = trimmed.indexOf('=');
        const key = trimmed.slice(0, splitIndex).trim();
        const value = trimmed.slice(splitIndex + 1).trim().replace(/^['"]|['"]$/g, '');

        if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
            continue;
        }

        process.env[key] = value;
        envValues[key] = value;
    }

    return envValues;
}

/**
 * Author: GitHub Copilot
 * Action / Modification: Resolve the active Jira target issue key from scenario data, environment variables, or the default config
 * Timestamp: 2026-09-24T14:29:00+02:00
 * Version: v1.0.0
 */
function resolveTargetIssueKey(scenarioData = {}) {
    const candidates = [
        scenarioData.TestExecutionKey,
        scenarioData.JiraKey,
        scenarioData.IssueKey,
        scenarioData.testExecutionKey,
        scenarioData.jiraKey,
        scenarioData.issueKey,
        process.env.TEST_EXECUTION_KEY,
        process.env.JIRA_ISSUE_KEY,
        process.env.DEFAULT_JIRA_ISSUE_KEY,
    ];

    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) {
            return value;
        }
    }

    return (getJiraConfig().issueKey || '').trim();
}

/**
 * Author: GitHub Copilot
 * Action / Modification: Standardize the generated Jira evidence filename with scenario name, verdict, and timestamp
 * Timestamp: 2026-09-24T14:29:00+02:00
 * Version: v1.0.0
 */
function buildEvidenceFileName({ scenarioName, status, timestamp } = {}) {
    const safeScenario = String(scenarioName || 'scenario').trim().replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'scenario';
    const safeStatus = String(status || 'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'UNKNOWN';
    const safeTimestamp = String(timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
    return `[AUTO]_${safeScenario}_${safeStatus}_${safeTimestamp}.docx`;
}

// Trims a Jira API response to a short, safe preview so it can be logged without dumping a huge server payload.
function getSafeJiraResponseBody(responseText) {
    if (!responseText) {
        return '(empty response body)';
    }

    return responseText.slice(0, 2000).replace(/\s+/g, ' ').trim();
}

// Creates a dedicated folder to keep the detailed Jira upload result for each file attachment.
function ensureJiraResultsDir() {
    const jiraResultsDir = path.resolve(__dirname, '../jira-results');
    if (!fs.existsSync(jiraResultsDir)) {
        fs.mkdirSync(jiraResultsDir, { recursive: true });
    }
    return jiraResultsDir;
}

// Saves the full upload data to a markdown file so terminal output stays short while keeping the details for audit/debugging.
function writeJiraUploadMarkdown(details) {
    const jiraResultsDir = ensureJiraResultsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeFileName = (details.documentFilename || 'jira-upload').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const fileName = `jira-upload-${safeFileName}-${timestamp}.md`;
    const fullPath = path.join(jiraResultsDir, fileName);

    const markdown = [
        '# Jira Upload Result',
        '',
        `- Timestamp: ${details.timestamp || new Date().toISOString()}`,
        `- Status: ${details.success ? 'Success' : 'Failed'}`,
        `- Issue Key: ${details.issueKey || 'N/A'}`,
        `- File Name: ${details.documentFilename || 'N/A'}`,
        `- File Path: ${details.filePath || 'N/A'}`,
        `- HTTP Status: ${details.status || 'N/A'}`,
        `- Error Code: ${details.code || 'N/A'}`,
        '',
        '## Details',
        '',
        `Message: ${details.message || 'N/A'}`,
        '',
        '## Response Body',
        '',
        '```text',
        details.responseBody || '(empty response body)',
        '```',
    ].join('\n');

    fs.writeFileSync(fullPath, markdown, 'utf8');
    return fullPath;
}

// Builds the Jira configuration from environment variables and .env values.
function getJiraConfig() {
    loadDotEnv();

    return {
        baseUrl: (process.env.JIRA_BASE_URL || '').replace(/\/$/, ''),
        email: process.env.JIRA_EMAIL || '',
        apiToken: process.env.JIRA_API_TOKEN || '',
        issueKey: process.env.JIRA_ISSUE_KEY || '',
    };
}

// Main Jira attachment logic: validates the file, creates the Basic Auth request, uploads to Jira, and records the result.
async function uploadDocxToJira({ issueKey, filePath, fileName, baseUrl, email, apiToken }) {
    const config = {
        issueKey: issueKey || process.env.JIRA_ISSUE_KEY || '',
        filePath: filePath || '',
        fileName: fileName || path.basename(filePath || 'report.docx'),
        baseUrl: baseUrl || (process.env.JIRA_BASE_URL || '').replace(/\/$/, ''),
        email: email || process.env.JIRA_EMAIL || '',
        apiToken: apiToken || process.env.JIRA_API_TOKEN || '',
    };

    try {
        if (!config.issueKey) {
            throw new Error('JIRA_ISSUE_KEY is missing. Set the issue key before attaching the document.');
        }

        if (!config.baseUrl) {
            throw new Error('JIRA_BASE_URL is missing. Set the Jira Cloud base URL before attaching the document.');
        }

        if (!config.email || !config.apiToken) {
            throw new Error('JIRA_EMAIL or JIRA_API_TOKEN is missing. Use your personal Jira credentials for the upload.');
        }

        const resolvedFilePath = path.resolve(config.filePath);
        if (!fs.existsSync(resolvedFilePath)) {
            const error = new Error(`DOCX file not found: ${resolvedFilePath}`);
            error.code = 'DOCX_FILE_NOT_FOUND';
            error.issueKey = config.issueKey;
            error.documentFilename = config.fileName;
            error.filePath = resolvedFilePath;
            writeJiraUploadMarkdown({
                success: false,
                issueKey: config.issueKey,
                documentFilename: config.fileName,
                filePath: resolvedFilePath,
                status: 'N/A',
                code: error.code,
                message: error.message,
                responseBody: 'File not found before upload.',
            });
            throw error;
        }

        const authHeader = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
        const uploadUrl = `${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(config.issueKey)}/attachments`;
        const fileBuffer = fs.readFileSync(resolvedFilePath);
        const formData = new FormData();

        formData.append('file', new Blob([fileBuffer], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }), config.fileName);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${authHeader}`,
                Accept: 'application/json',
                'X-Atlassian-Token': 'no-check',
            },
            body: formData,
        });

        const responseBody = await response.text();
        const safeBody = getSafeJiraResponseBody(responseBody);

        if (!response.ok) {
            const error = new Error(`Jira upload failed with HTTP ${response.status}`);
            error.status = response.status;
            error.issueKey = config.issueKey;
            error.documentFilename = config.fileName;
            error.filePath = resolvedFilePath;
            error.responseBody = safeBody;

            if (response.status === 401) {
                error.code = 'JIRA_AUTH_FAILED';
            } else if (response.status === 403) {
                error.code = 'JIRA_PERMISSION_FAILED';
            } else if (response.status === 404) {
                error.code = 'JIRA_ISSUE_NOT_FOUND';
            } else if (response.status === 400) {
                error.code = 'JIRA_BAD_REQUEST';
            } else {
                error.code = 'JIRA_HTTP_FAILURE';
            }

            writeJiraUploadMarkdown({
                success: false,
                issueKey: error.issueKey,
                documentFilename: error.documentFilename,
                filePath: error.filePath,
                status: error.status,
                code: error.code,
                message: error.message,
                responseBody: error.responseBody,
            });
            console.log('File uploading was unsuccessful');
            throw error;
        }

        const result = {
            success: true,
            status: response.status,
            issueKey: config.issueKey,
            documentFilename: config.fileName,
            filePath: resolvedFilePath,
            responseBody: safeBody,
        };

        writeJiraUploadMarkdown({
            success: true,
            issueKey: result.issueKey,
            documentFilename: result.documentFilename,
            filePath: result.filePath,
            status: result.status,
            code: 'SUCCESS',
            message: 'File uploaded successfully',
            responseBody: result.responseBody,
        });
        console.log('File uploaded successfully');
        return result;
    } catch (error) {
        const friendlyMessage = error && error.message ? error.message : 'Unknown Jira upload error';
        const issueKey = error && error.issueKey ? error.issueKey : config.issueKey;
        const documentFilename = error && error.documentFilename ? error.documentFilename : config.fileName;
        const responseBody = error && error.responseBody ? error.responseBody : 'No response body captured.';
        const code = error && error.code ? error.code : 'UNKNOWN_ERROR';
        const status = error && error.status ? error.status : 'N/A';

        if (!error || !error.message || !error.message.includes('Jira upload failed with HTTP')) {
            writeJiraUploadMarkdown({
                success: false,
                issueKey,
                documentFilename,
                filePath: config.filePath,
                status,
                code,
                message: friendlyMessage,
                responseBody,
            });
        }

        if (!error || !error.message || !error.message.includes('Jira upload failed with HTTP')) {
            console.log('File uploading was unsuccessful');
        }
        throw error;
    }
}

/**
 * Author: GitHub Copilot
 * Action / Modification: Post one Jira summary comment to the resolved target execution issue with the scenario status table
 * Timestamp: 2026-09-24T14:29:00+02:00
 * Version: v1.0.0
 */
async function postJiraSummaryComment({ issueKey, baseUrl, email, apiToken, summaryRows = [] } = {}) {
    const config = {
        issueKey: issueKey || process.env.TEST_EXECUTION_KEY || process.env.JIRA_ISSUE_KEY || process.env.DEFAULT_JIRA_ISSUE_KEY || '',
        baseUrl: (baseUrl || process.env.JIRA_BASE_URL || '').replace(/\/$/, ''),
        email: email || process.env.JIRA_EMAIL || '',
        apiToken: apiToken || process.env.JIRA_API_TOKEN || '',
    };

    if (!config.issueKey || !config.baseUrl || !config.email || !config.apiToken) {
        console.warn('[Jira] Summary comment skipped because the target issue key or Jira credentials are not configured.');
        return { skipped: true, reason: 'Jira summary config missing.' };
    }

    const rows = Array.isArray(summaryRows) ? summaryRows : [];
    const passedCount = rows.filter((row) => String(row.status || '').toUpperCase() === 'PASSED').length;
    const failedCount = rows.filter((row) => String(row.status || '').toUpperCase() === 'FAILED').length;
    const scenarioList = rows.length > 0
        ? rows.map((row) => `- ${row.scenarioName || 'Unknown'} | ${row.status || 'UNKNOWN'} | ${row.attachment || 'N/A'} | ${row.module || 'N/A'} | ${row.businessArea || 'N/A'}`)
        : ['- No scenario data captured.'];

    const body = [
        `Automation summary for ${config.issueKey}`,
        '',
        `Total scenarios: ${rows.length}`,
        `Passed: ${passedCount}`,
        `Failed: ${failedCount}`,
        '',
        'Scenario results:',
        ...scenarioList,
    ].join('\n');

    const authHeader = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    try {
        const response = await fetch(`${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(config.issueKey)}/comment`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${authHeader}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ body }),
        });

        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`Jira summary comment failed with HTTP ${response.status}: ${responseText}`);
        }

        return {
            skipped: false,
            issueKey: config.issueKey,
            status: response.status,
            responseBody: responseText,
        };
    } catch (error) {
        console.warn(`[Jira] ${error.message}`);
        return { skipped: true, reason: error.message };
    }
}

module.exports = {
    loadDotEnv,
    getJiraConfig,
    resolveTargetIssueKey,
    buildEvidenceFileName,
    uploadDocxToJira,
    postJiraSummaryComment,
};