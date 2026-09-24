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

module.exports = {
    loadDotEnv,
    getJiraConfig,
    uploadDocxToJira,
};