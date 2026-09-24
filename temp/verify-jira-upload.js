const fs = require('fs');
const path = require('path');
const { uploadDocxToJira } = require('./HelperClasses/jira');
const dir = path.resolve('./temp');
fs.mkdirSync(dir, { recursive: true });
const filePath = path.join(dir, 'sample.docx');
fs.writeFileSync(filePath, 'dummy');
const logs = [];
const originalLog = console.log;
console.log = (...args) => logs.push(args.join(' '));
global.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ id: 'abc' })
});
(async () => {
  try {
    await uploadDocxToJira({
      issueKey: 'ABC-123',
      filePath: filePath,
      fileName: 'sample.docx',
      baseUrl: 'https://example.atlassian.net',
      email: 'a@b.com',
      apiToken: 'token'
    });
  } catch (e) {
    console.error(e.message);
  } finally {
    console.log = originalLog;
    console.log('TERMINAL_OUTPUT_START');
    console.log(logs.join('\n'));
    console.log('TERMINAL_OUTPUT_END');
    const files = fs.readdirSync('./jira-results');
    console.log('JIRA_RESULTS_COUNT=' + files.length);
  }
})();
