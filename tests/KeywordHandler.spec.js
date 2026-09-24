//import libraries for different functionalities
const scenarioSets = JSON.parse(JSON.stringify(require('../utils/ScenarioNumbers.json')));
const ExcelJS = require('exceljs');
const { expect, test } = require('@playwright/test');
const { alert } = require('vscode-websocket-alerts');
const {ORHandler} = require('../HelperClasses/ORHandler');
const {ActionLibrary} = require('../HelperClasses/ActionLibrary');
const fs = require('fs');
const path = require('path');
const { keywordsExcel, runResultDir } = require('../paths.config');
/**
 * Author: GitHub Copilot
 * Action / Modification: Resolve the target Jira issue dynamically and attach scenario evidence using the runner's existing Jira upload flow
 * Timestamp: 2026-09-24T14:29:00+02:00
 * Version: v1.0.0
 */

const { cleanupAfterDocOrBrowser, forceKillPlaywrightProcesses } = require('../utils/cleanupTestResults');
const { getJiraConfig, uploadDocxToJira, resolveTargetIssueKey, buildEvidenceFileName, postJiraSummaryComment } = require('../HelperClasses/jira');
const { calculateScenarioResult } = require('../HelperClasses/scenarioEvaluationService');
const testResultsDir = path.resolve(__dirname, '../test-results');
const runSummary = {
    totalScenarios: 0,
    passedScenarios: 0,
    failedScenarios: 0,
    summaryRows: [],
};

function ensureDirectory(dir) {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
            console.warn(`Could not create directory ${dir}: ${err.message}`);
        }
    }
}

function deleteDirectory(dir) {
    if (fs.existsSync(dir)) {
        try {
            forceKillPlaywrightProcesses();
            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`Removed directory: ${dir}`);
        } catch (err) {
            console.warn(`Could not remove directory ${dir}: ${err.message}`);
            forceKillPlaywrightProcesses();
        }
    }
}

function clearDirectoryContents(dir) {
    ensureDirectory(dir);
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(fullPath);
            }
        }
    } catch (err) {
        console.warn(`Could not clear contents of ${dir}: ${err.message}`);
    }
}

// Jira upload is kept opt-in per scenario using UploadFlag in ScenarioNumbers.json.
function isScenarioUploadEnabled(scenarioSet = {}) {
    const value = (scenarioSet.UploadFlag || 'F').toString().trim().toUpperCase();
    return value === 'Y';
}

/**
 * Author: GitHub Copilot
 * Action / Modification: Attach the generated evidence to the dynamically resolved Jira target issue key while preserving the current UploadFlag gate
 * Timestamp: 2026-09-24T14:29:00+02:00
 * Version: v1.0.0
 */
// This is the integration point where the generated DOCX is attached to Jira only when the scenario allows it.
async function attachGeneratedDocxIfConfigured(docxPath, scenarioName, scenarioSet = {}, scenarioResult = {}) {
    const jiraConfig = getJiraConfig();
    const issueKey = resolveTargetIssueKey(scenarioSet);
    const uploadEnabled = isScenarioUploadEnabled(scenarioSet) && !!issueKey;

    if (!uploadEnabled) {
        return { skipped: true, reason: 'Jira upload is disabled for this scenario. Set UploadFlag to Y in ScenarioNumbers.json to enable attachment upload.' };
    }

    try {
        const uploadResult = await uploadDocxToJira({
            issueKey,
            filePath: docxPath,
            fileName: path.basename(docxPath),
            baseUrl: jiraConfig.baseUrl,
            email: jiraConfig.email,
            apiToken: jiraConfig.apiToken,
        });

        if (scenarioResult && scenarioResult.verdict) {
            console.log(`[${scenarioName}] Jira evidence upload completed for ${issueKey} with verdict ${scenarioResult.verdict}`);
        }

        return uploadResult;
    } catch (error) {
        return { skipped: false, error: error.message, status: error.status || null };
    }
}

// Batch mode: set BATCH_MODE=1 and BATCH_NUM=n (1-based) to run batch n of 5 scenarios
// Single scenario mode: set SCENARIO_NAME=YourScenarioName to run only that scenario
const BATCH_MODE = process.env.BATCH_MODE === '1';
const BATCH_NUM = parseInt(process.env.BATCH_NUM || '1', 10);
const BATCH_SIZE = 5;

// Support multiple scenario names as comma-separated list
const SCENARIO_NAME = process.env.SCENARIO_NAME;
let scenariosToRun = scenarioSets.filter(s => s.RunFlag === "Y");
if (SCENARIO_NAME) {
    const scenarioList = SCENARIO_NAME.split(',').map(s => s.trim());
    scenariosToRun = scenariosToRun.filter(s => scenarioList.includes(s.ScenarioName));
} else if (BATCH_MODE) {
    const start = (BATCH_NUM - 1) * BATCH_SIZE;
    scenariosToRun = scenariosToRun.slice(start, start + BATCH_SIZE);
}

// Guard destructive/one-time cleanup so it doesn't run in every worker.
// Global cleanup is handled in global-setup.js; keep this guard to preserve
// behavior when running without Playwright globalSetup (debug runs).
if (process.env.PLAYWRIGHT_WORKER_INDEX === '0' || typeof process.env.PLAYWRIGHT_WORKER_INDEX === 'undefined') {
    // Delete test-results directory before running any scenario or batch.
    deleteDirectory(testResultsDir);
    ensureDirectory(testResultsDir);

    // Create temp-traces directory if it doesn't exist.
    const tempTracesDir = path.resolve(__dirname, '../temp-traces');
    ensureDirectory(tempTracesDir);
} else {
    console.log(`Worker ${process.env.PLAYWRIGHT_WORKER_INDEX} skipping top-level cleanup (global-setup handles it).`);
}

test.beforeEach(async () => {
    forceKillPlaywrightProcesses();
    ensureDirectory(testResultsDir);
});

test.afterEach(async () => {
    clearDirectoryContents(testResultsDir);
});

for(const scenarioSet of scenariosToRun)
{
    //import libraries for word file evidence creation
    const fs = require('fs');
    const Officegen = require('officegen');
    const Docx = Officegen('docx');
    let keywordStatus = [];

    //test block for executing each scenario
    test(`Scenario Executing - ${scenarioSet.ScenarioName}`,async ({browser})=>
    {
        console.log(`\n========== STARTING SCENARIO: ${scenarioSet.ScenarioName} ==========\n`);
        // Initiate a new page in browser. Ignore HTTPS errors so tests can open
        // sites that present certificate/security popups (non-intrusive change).
        const context = await browser.newContext({ ignoreHTTPSErrors: true });
        let page = await context.newPage();

        const currentDate = new Date();
        const dateExecuted = currentDate.getDate();
        const monthExecuted = currentDate.getMonth();
        const yearExecuted = currentDate.getFullYear();
        const hourExecuted = currentDate.getHours();
        const minuteExecuted = currentDate.getMinutes();
        //Create objects of ActionLibrary.js and ORHandler.js
        const OR = new ORHandler(context, page);
        const actLib = new ActionLibrary(context, page);
        //Read Keyword excel file
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(keywordsExcel);
        const worksheet = workbook.getWorksheet('Keyword');
        
        let screenshot , operation, ORSheet, ServiceRequestNum , screenshotFilePath , CaptureSR, FailedApi,flagCheck;
        let i = 0;
        let j = 0;
        let count = 0;
        let action = [];
        let locator = [];
        let rNum ;
        //Store row number of matching scenario from Keyword excel file
        worksheet.eachRow((row, rowNumber) =>
        {
        row.eachCell((cell, colNumber) =>
        {
            if(cell.value === scenarioSet.ScenarioName)
            {
                rNum = rowNumber;
            }   
        })
        })
        //store the scenario in a variable and split Keyword based on underscore
        const scenario = worksheet.getRow(rNum).values;
        for(let a=2; a<scenario.length; a++)
        {
            const keyword = scenario[a].split("_");
            action[i] = keyword[0];
            locator[j] = keyword[1];
            i = i+1;
            j = j+1;
        }
    //iterate through each keyword in a scenario\
    let scenarioAboredByUser = false;
    for (let k = 0; k < action.length; k++)
    {
        if(scenarioAboredByUser) {
            scenarioAboredByUser=false;
            k=action.length+1;
            break;
        }
        // Print the current keyword to stdout so it appears in the terminal and can be streamed to the UI
        try {
            const kw = `${action[k]}_${locator[k]}`;
            console.log(`[${scenarioSet.ScenarioName}] KEYWORD: ${kw}`);
        } catch (e) {
            console.log(`[${scenarioSet.ScenarioName}] ${scenario[k+2]}`);
            // ignore if undefined
        }
        // If either part is undefined treat this as end of scenario and exit loop gracefully
        if (typeof action[k] === 'undefined' || typeof locator[k] === 'undefined') {
            console.log('Scenario ended: no more keywords (undefined encountered).');
            break;
        }
        switch (action[k] ) {
        case "Navigate":
            try{
                if(locator[k]==="ServiceDashBoardOpen")
                {
                    const newTabOpen = await actLib.tabChange(OR,action[k])
                    page = newTabOpen.page1
                    ORSheet = newTabOpen.ORSheet
                    screenshotFilePath = ORSheet.screenshot;
                    flagCheck=ORSheet.flagcheck;
                    keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                }
                else if(locator[k]==="ServiceDashBoardClose")
                {
                    const newTab = await actLib.tabChangeGL(OR,action[k]);
                    page = newTab.page1;
                    ORSheet = newTab.ORSheet;
                    screenshotFilePath = ORSheet.screenshot;
                    flagCheck=ORSheet.flagcheck;
                    keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                }
                else if(locator[k]==="ServiceDashBoardMax")
                {
                    const newTab = await actLib.tabChangeMAX(OR,action[k]);
                    page = newTab.page1;
                    ORSheet = newTab.ORSheet;
                    screenshotFilePath = ORSheet.screenshot;
                    flagCheck=ORSheet.flagcheck;
                    keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                }
                // else if(locator[k]==="CollectionHistory")
                // {
                //     const newTab = await actLib.tabChangeCollectionHistory(OR,action[k]);
                //     page = newTab.page1;
                //     ORSheet = newTab.ORSheet;
                //     screenshotFilePath = ORSheet.screenshot;
                //     flagCheck=ORSheet.flagcheck;
                //     keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                // }
                else if(locator[k]==="ConservationDashBoardOpen")
                {
                    const newTabOpen = await actLib.tabChangeConservation(OR,action[k])
                    page = newTabOpen.page1
                    ORSheet = newTabOpen.ORSheet
                    screenshotFilePath = ORSheet.screenshot;
                    flagCheck=ORSheet.flagcheck;
                    keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                }
                else if(locator[k]==="ConservationDashBoardClose")
                {
                    const newTab = await actLib.tabChangeConservationGL(OR,action[k]);
                    page = newTab.page1;
                    ORSheet = newTab.ORSheet;
                    screenshotFilePath = ORSheet.screenshot;
                    flagCheck=ORSheet.flagcheck;
                    keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                }
                else if(locator[k]==="CustomerAdviceRecordYesYes")
                {
                    try{
                        await expect(page.locator("text='CUSTOMER ADVICE RECORD'")).toBeVisible();
                        flagCheck=0;
                        keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                    }
                    catch(error){
                        flagCheck=1;
                        keywordStatus[k] = 'Failed';
                        break;
                    }
                    const carPage = await actLib.carPageAction(locator[k])
                    for(let i=0;i<carPage.screenshot.length;i++)
                    {
                        operation = await Docx.createP();
                        operation = await Docx.createP();
                        await operation.addText(`${carPage.action[i]} ${carPage.locator[i]}.`);
                        operation = await Docx.createP();
                        await operation.addText("Actual Result - ")
                        await operation.addText("Passed",{ color: '#008000', bold: true })
                        await operation.addImage(carPage.screenshot[i], {cx: 600, cy: 250})
                    }
                    break;
                }
                else if(locator[k]==="CustomerAdviceRecordYesYesYes")
                {
                    try{
                    await expect(page.locator("text='CUSTOMER ADVICE RECORD'")).toBeVisible();
                    flagCheck=0;
                    keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                    }
                    catch(error){
                        flagCheck=1;
                        keywordStatus[k] = 'Failed';
                        break;
                    }
                    const carPage = await actLib.carPageActionnew(locator[k])
                    for(let i=0;i<carPage.screenshot.length;i++)
                    {
                        operation = await Docx.createP();
                        operation = await Docx.createP();
                        await operation.addText(`${carPage.action[i]} ${carPage.locator[i]}.`);
                        operation = await Docx.createP();
                        await operation.addText("Actual Result - ")
                        await operation.addText("Passed",{ color: '#008000', bold: true })
                        await operation.addImage(carPage.screenshot[i], {cx: 600, cy: 250})
                    }
                }
                else if(locator[k]==="OpenMoneyAccount")
                {
                    const moneyAccountTabOpen = await actLib.moneyAccountTab(OR,action[k]);
                    ORSheet = moneyAccountTabOpen.ORSheet;
                    screenshotFilePath = ORSheet.screenshot;
                    flagCheck=ORSheet.flagcheck;
                    keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                }
                else if(locator[k]==="MyTeamOpen")
                {
                    const newTabOpen = await actLib.tabChangeMyTeam(OR,action[k])
                    page = newTabOpen.page1
                    ORSheet = newTabOpen.ORSheet
                    screenshotFilePath = ORSheet.screenshot;
                    flagCheck=ORSheet.flagcheck;
                    keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                }
                else
                {
                    ORSheet = await OR.getORSheet(action[k], locator[k]);
                    screenshotFilePath = ORSheet.screenshot;
                    flagCheck=ORSheet.flagcheck;
                    keywordStatus[k] = flagCheck === 0 ? 'Passed' : 'Failed';
                    //FailedApi = await actLib.captureFailedAPIs(page);                    
                    //console.log(FailedApi);
                }
                operation = await Docx.createP();
                operation = await Docx.createP();
                await operation.addText(`${action[k]} ${locator[k]}.`);
                operation = await Docx.createP();
                await operation.addText("Actual Result - ")
                if(flagCheck==0)
                {    
                    await operation.addText("Passed",{ color: '#008000', bold: true })                      
                }
                if (flagCheck==1)
                {  
                    await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                    count = count + 1;
                }
                await operation.addImage(screenshotFilePath, {cx: 600, cy: 250});
                operation = await Docx.createP();
                //await operation.addText("Failed API Details:");
                //await operation.addText(JSON.stringify(FailedApi, null, 2));
                
            }
            catch(error)
            {
                keywordStatus[k] = 'Failed';
                expect.soft(false).toBeTruthy();
                //alert(`Exception - ${action[k]}_${locator[k]}`);
                //await page.waitForTimeout(10000);
                screenshot = await actLib.captureScreenShot(action[k],locator[k])
                operation = await Docx.createP();
                operation = await Docx.createP();
                await operation.addText(`${action[k]} ${locator[k]}.`);
                operation = await Docx.createP();
                await operation.addText("Actual Result - ")
                await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                await operation.addImage(screenshot, {cx: 600, cy: 250})
               // FailedApi = await actLib.captureFailedAPIs(page);
             // Adding the failed API logs to the Word document
                operation = await Docx.createP();
               // await operation.addText("Failed API Details:");
                //await operation.addText(JSON.stringify(FailedApi, null, 2));
                count = count + 1;
                const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                if (decision === 'exit') {
                    scenarioAboredByUser = true;
                    console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                    break;
                }
                console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
            }
            break;
        case "GOTO":
                try
                {
                    screenshot = await actLib.openURL(action[k],locator[k]);
                    operation = await Docx.createP();
                    operation = await Docx.createP();
                    await operation.addText(`${action[k]} ${locator[k]}.`);
                    operation = await Docx.createP();
                    await operation.addText("Actual Result - ")
                    await operation.addText("Passed",{ color: '#008000', bold: true })
                    await operation.addImage(screenshot, {cx: 600, cy: 250});
                    //await page.waitForTimeout(5000);
                    keywordStatus[k] = 'Passed';
                }
                catch(error)
                {   
                    keywordStatus[k] = 'Failed';
                    expect.soft(false).toBeTruthy();
                    //alert(`Exception - ${action[k]}_${locator[k]}`);
                   // await page.waitForTimeout(10000);
                    screenshot = await actLib.captureScreenShot(action[k],locator[k])
                    operation = await Docx.createP();
                    operation = await Docx.createP();
                    await operation.addText(`${action[k]} ${locator[k]}.`);
                    operation = await Docx.createP();
                    await operation.addText("Actual Result - ")
                    await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                    await operation.addImage(screenshot, {cx: 600, cy: 250})
                    count = count + 1;
                    const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                    if (decision === 'exit') {
                        scenarioAboredByUser = true;
                        console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                        break;
                    }
                    console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                    alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
                }
            break;
        case "Enter":
            let data;
            let enterData;
            try{
                keywordStatus[k] = 'Passed';
            data = locator[k].split("-");
            for(let l = 0; l<=ORSheet.obName.length; l++)
            {
                if(ORSheet.obName[l]===data[0])
                {
                    // if(locator[k] === "Password")
                    // {
                    // enterData = await actLib.enterText(action[k],ORSheet.obName[l],ORSheet.obRef[l], "Password@01");
                    // operation = await Docx.createP();
                    // operation = await Docx.createP();
                    // await operation.addText(`${action[k]} Password@01 in ${data[0]}.`);
                    // }
                    //else
                   // {  
                    enterData = await actLib.enterText(action[k],ORSheet.obName[l],ORSheet.obRef[l],data[1]);
                    operation = await Docx.createP();
                    operation = await Docx.createP();
                    await operation.addText(`${action[k]} ${enterData.dataVal} in ${data[0]}.`);                    
                    break;
                }
            }
            operation = await Docx.createP();
            screenshotFilePath = (await enterData.screenshot).toString();
            await operation.addText("Actual Result - ")
            await operation.addText("Passed",{ color: '#008000', bold: true })
            await operation.addImage(screenshotFilePath, {cx: 600, cy: 250})
            }
            catch(error)
            {
                keywordStatus[k] = 'Failed';
                //await expect.soft(page.locator('#Name')).toBeVisible();
                expect.soft(false).toBeTruthy();
                alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
               // await page.waitForTimeout(10000);
                screenshot = await actLib.captureScreenShot(action[k],locator[k])
                operation = await Docx.createP();
                operation = await Docx.createP();
                await operation.addText(`${action[k]} value in ${data[0]}.`);
                operation = await Docx.createP();
                await operation.addText("Actual Result - ")
                await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                await operation.addImage(screenshot, {cx: 600, cy: 250})
                count = count + 1;
                const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]} Failed: Error Occured.Please Check`);
                if (decision === 'exit') {
                    scenarioAboredByUser = true;
                    console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                    break;
                }
                console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
            }
            break;
        case "Select":
                let data1;
                let selectData;
                try{
                keywordStatus[k] = 'Passed';
                data1 = locator[k].split("-");
                for(let l = 0; l<=ORSheet.obName.length; l++)
                {
                    if(ORSheet.obName[l]===data1[0])
                    {  
                        selectData = await actLib.selectText(action[k],ORSheet.obName[l],ORSheet.obRef[l],data1[1]);
                        break;
                    }
                    else if(locator[k] === "YCIDateIndex2")
                    {
                        selectData = await actLib.yearly(action[k],locator[k]);
                        break;
                    }
                }
                screenshotFilePath = (await selectData.screenshot).toString();
                operation = await Docx.createP();
                operation = await Docx.createP();
                await operation.addText(`${action[k]} ${selectData.dataVal} from ${data1[0]}.`);
                operation = await Docx.createP();
                await operation.addText("Actual Result - ")
                await operation.addText("Passed",{ color: '#008000', bold: true })
                await operation.addImage(screenshotFilePath, {cx: 600, cy: 250})
               }
                catch(error)
                {   
                    keywordStatus[k] = 'Failed';
                    expect.soft(false).toBeTruthy();
                    //alert(`Exception - ${action[k]}_${locator[k]}`);
                 //   await page.waitForTimeout(10000);
                    screenshot = await actLib.captureScreenShot(action[k],locator[k])
                    operation = await Docx.createP();
                    operation = await Docx.createP();
                    await operation.addText(`${action[k]} option from ${data1[0]}.`);
                    operation = await Docx.createP();
                    await operation.addText("Actual Result - ")
                    await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                    await operation.addImage(screenshot, {cx: 600, cy: 250})
                    count = count + 1;
                    const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]} - Failed: Issue Occured. Please Check`);
                    if (decision === 'exit') {
                        scenarioAboredByUser = true;
                        console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                        break;
                    }
                    console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                    alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
                    }
                break;
        case "Click":
            try{
                keywordStatus[k] = 'Passed';
            for(let m = 0; m<=ORSheet.obName.length; m++)
            {
                if(ORSheet.obName[m]===locator[k])
                {
                    if(locator[k] === "UploadDoc"||locator[k] === "UploadDocAnother")
                    {
                        const newWindow = await actLib.onClickUploadDoc(action[k], ORSheet.obName[m],ORSheet.obRef[m]);
                        operation = await Docx.createP();
                        operation = await Docx.createP();
                        await operation.addText(`${action[k]} ${locator[k]}.`);
                        operation = await Docx.createP();
                        await operation.addText("Actual Result - ")
                        await operation.addText("Passed",{ color: '#008000', bold: true })
                        await operation.addImage(newWindow, {cx: 600, cy: 250})
                    }
                    else if(locator[k] === "DifferentTypeUpload")
                    {
                        const newWindow1 = await actLib.onClickDiffFile(action[k], ORSheet.obName[m],ORSheet.obRef[m]);
                        operation = await Docx.createP();
                        operation = await Docx.createP();
                        await operation.addText(`${action[k]} ${locator[k]}.`);
                        operation = await Docx.createP();
                        await operation.addText("Actual Result - ")
                        await operation.addText("Passed",{ color: '#008000', bold: true })
                        await operation.addImage(newWindow1, {cx: 600, cy: 250})
                    }
                    else if(locator[k] === "IEAddFile"  || locator[k] === "AddAnotherButton")
                    {
                        const newWindow1 = await actLib.onClickIEAddFile(action[k], ORSheet.obName[m],ORSheet.obRef[m]);
                        operation = await Docx.createP();
                        operation = await Docx.createP();
                        await operation.addText(`${action[k]} ${locator[k]}.`);
                        operation = await Docx.createP();
                        await operation.addText("Actual Result - ")
                        await operation.addText("Passed",{ color: '#008000', bold: true })
                        await operation.addImage(newWindow1, {cx: 600, cy: 250})
                    }
                    else
                    {
                        screenshotFilePath = await actLib.onClick(action[k], ORSheet.obName[m], ORSheet.obRef[m]);
                        operation = await Docx.createP();
                        operation = await Docx.createP();
                        await operation.addText(`${action[k]} ${locator[k]}.`);
                        operation = await Docx.createP();
                        await operation.addText("Actual Result - ")
                        await operation.addText("Passed",{ color: '#008000', bold: true })
                        await operation.addImage(screenshotFilePath, {cx: 600, cy: 250})
                    }
                    break;
                }
            }
            }
            catch(error)
            {   
                keywordStatus[k] = 'Failed';
                expect.soft(false).toBeTruthy();
                //alert(`Exception - ${action[k]}_${locator[k]}`);
              //  await page.waitForTimeout(10000);
                screenshot = await actLib.captureScreenShot(action[k],locator[k])
                operation = await Docx.createP();
                operation = await Docx.createP();
                await operation.addText(`${action[k]} ${locator[k]}.`);
                operation = await Docx.createP();
                await operation.addText("Actual Result - ")
                await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                await operation.addImage(screenshot, {cx: 600, cy: 250})
                count = count + 1;
                const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                if (decision === 'exit') {
                    scenarioAboredByUser = true;
                    console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                    break;
                }
                console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
            }
            break;
        case "Check":
            try{
                keywordStatus[k] = 'Passed';
            for(let n=0;n<ORSheet.obName.length;n++)
            {
                if(ORSheet.obName[n] === locator[k])
                {
                    screenshotFilePath = await actLib.checkElement(action[k], ORSheet.obName[n], ORSheet.obRef[n]);
                }
            }
            operation = await Docx.createP();
            operation = await Docx.createP();
            await operation.addText(`${action[k]} ${locator[k]}.`);
            operation = await Docx.createP();
            await operation.addText("Actual Result - ")
            await operation.addText("Passed",{ color: '#008000', bold: true })
            await operation.addImage(screenshotFilePath, {cx: 600, cy: 250})
            }
            catch(error)
            {   
                keywordStatus[k] = 'Failed';
                expect.soft(false).toBeTruthy();
                //alert(`Exception - ${action[k]}_${locator[k]}`);
            //    await page.waitForTimeout(10000);
                screenshot = await actLib.captureScreenShot(action[k],locator[k])
                operation = await Docx.createP();
                operation = await Docx.createP();
                await operation.addText(`${action[k]} ${locator[k]}.`);
                operation = await Docx.createP();
                await operation.addText("Actual Result - ")
                await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                await operation.addImage(screenshot, {cx: 600, cy: 250})
                count = count + 1;
                const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                if (decision === 'exit') {
                    scenarioAboredByUser = true;
                    console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                    break;
                }
                console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
            }
            break;
        case "CheckNot":
            try{
                keywordStatus[k] = 'Passed';
            for(let n=0;n<ORSheet.obName.length;n++)
            {
                if(ORSheet.obName[n] === locator[k])
                {
                    screenshotFilePath = await actLib.checkNotElement(action[k], ORSheet.obName[n], ORSheet.obRef[n]);
                }
            }
            operation = await Docx.createP();
            operation = await Docx.createP();
            await operation.addText(`${action[k]} ${locator[k]}.`);
            operation = await Docx.createP();
            await operation.addText("Actual Result - ")
            await operation.addText("Passed",{ color: '#008000', bold: true })
            await operation.addImage(screenshotFilePath, {cx: 600, cy: 250})
            }
            catch(error)
            {   
                keywordStatus[k] = 'Failed';
                expect.soft(false).toBeTruthy();
                //alert(`Exception - ${action[k]}_${locator[k]}`);
              //  await page.waitForTimeout(10000);
                screenshot = await actLib.captureScreenShot(action[k],locator[k])
                operation = await Docx.createP();
                operation = await Docx.createP();
                await operation.addText(`${action[k]} ${locator[k]}.`);
                operation = await Docx.createP();
                await operation.addText("Actual Result - ")
                await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                await operation.addImage(screenshot, {cx: 600, cy: 250})
                count = count + 1;
                const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                if (decision === 'exit') {
                    scenarioAboredByUser = true;
                    console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                    break;
                }
                console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
            }
            break;
        case "SRNumber":
                try{
                    keywordStatus[k] = 'Passed';
                    for(let n=0;n<ORSheet.obName.length;n++)
                    {
                        if(ORSheet.obName[n] === locator[k])
                        {  
                            screenshotFilePath = await actLib.enterData(action[k],ORSheet.obName[n],ORSheet.obRef[n],ServiceRequestNum);                            
                        }
                    }
                    operation = await Docx.createP();
                    operation = await Docx.createP();
                    await operation.addText(`${action[k]} ${locator[k]}.`);
                    operation = await Docx.createP();
                    await operation.addText("Actual Result - ")
                    await operation.addText("Passed",{ color: '#008000', bold: true })
                    await operation.addImage(screenshotFilePath, {cx: 600, cy: 250});        
                }
                catch{
                    keywordStatus[k] = 'Failed';
                    expect.soft(false).toBeTruthy();
                    //alert(`Exception - ${action[k]}_${locator[k]}`);
                  //  await page.waitForTimeout(10000);
                    screenshot = await actLib.captureScreenShot(action[k],locator[k])
                    operation = await Docx.createP();
                    operation = await Docx.createP();
                    await operation.addText(`${action[k]} ${locator[k]}`);
                    operation = await Docx.createP();
                    await operation.addText("Actual Result - ")
                    await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                    await operation.addImage(screenshot, {cx: 600, cy: 250})
                    count = count + 1;
                    const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                    if (decision === 'exit') {
                        scenarioAboredByUser = true;
                        console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                        break;
                    }
                    console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                    alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
                }
                break;
        case "Capture":
                    try{
                        keywordStatus[k] = 'Passed';
                        for(let n=0;n<ORSheet.obName.length;n++)
                        {
                            if(ORSheet.obName[n] === locator[k])
                            {  
                                CaptureSR = await actLib.captureSr(action[k],ORSheet.obName[n],ORSheet.obRef[n]);
                                ServiceRequestNum = CaptureSR.SRNum;
                                screenshotFilePath = (await (CaptureSR.screenshot)).toString();
                            }
                        }
                        operation = await Docx.createP();
                        operation = await Docx.createP();
                        await operation.addText(`${action[k]} ${locator[k]}.`);
                        operation = await Docx.createP();
                        await operation.addText("Actual Result - ")
                        await operation.addText("Passed",{ color: '#008000', bold: true })
                        await operation.addImage(screenshotFilePath, {cx: 600, cy: 250});
                    }
                    catch{
                        keywordStatus[k] = 'Failed';
                        expect.soft(false).toBeTruthy();
                        alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
                      //  await page.waitForTimeout(10000);
                        screenshot = await actLib.captureScreenShot(action[k],locator[k])
                        operation = await Docx.createP();
                        operation = await Docx.createP();
                        await operation.addText(`${action[k]} ${locator[k]}.`);
                        operation = await Docx.createP();
                        await operation.addText("Actual Result - ")
                        await operation.addText("Failed",{ color: '#FF2C2C', bold: true });
                        await operation.addImage(screenshot, {cx: 600, cy: 250})
                        count = count + 1;
                        const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                        if (decision === 'exit') {
                            scenarioAboredByUser = true;
                            console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                            break;
                        }
                        console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                        alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
                    }
                break;
        case "Hover":
                try{
                    keywordStatus[k] = 'Passed';
                for(let n=0;n<ORSheet.obName.length;n++)
                {
                    if(ORSheet.obName[n] === locator[k])
                    {
                        screenshotFilePath = await actLib.hoverElement(action[k], ORSheet.obName[n], ORSheet.obRef[n]);
                    }
                }
                operation = await Docx.createP();
                operation = await Docx.createP();
                await operation.addText(`${action[k]} ${locator[k]}.`);
                operation = await Docx.createP();
                await operation.addText("Actual Result - ")
                await operation.addText("Passed",{ color: '#008000', bold: true })
                await operation.addImage(screenshotFilePath, {cx: 600, cy: 250})
                }
                catch(error)
                {
                    keywordStatus[k] = 'Failed';
                    expect.soft(false).toBeTruthy();
                    //alert(`Exception - ${action[k]}_${locator[k]}`);
                 //   await page.waitForTimeout(10000);
                    screenshot = await actLib.captureScreenShot(action[k],locator[k])
                    operation = await Docx.createP();
                    operation = await Docx.createP();
                    await operation.addText(`${action[k]} ${locator[k]}.`);
                    operation = await Docx.createP();
                    await operation.addText("Actual Result - ")
                    await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                    await operation.addImage(screenshot, {cx: 600, cy: 250})
                    count = count + 1;
                    const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                    if (decision === 'exit') {
                        scenarioAboredByUser = true;
                        console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                        break;
                    }
                    console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                    alert(`Exception - ${action[k]}_${locator[k]}`);
                }
                break;
        case "Download":
                    try{
                        keywordStatus[k] = 'Passed';
                        for(let o=0;o<ORSheet.obName.length;o++)
                        {
                            if(ORSheet.obName[o] === locator[k])
                            {
                                screenshotFilePath = await actLib.downloadFile(action[k], ORSheet.obName[o], ORSheet.obRef[o], scenarioSet.ScenarioName);
                            }
                        }
                        operation = await Docx.createP();
                        operation = await Docx.createP();
                        await operation.addText(`${action[k]} ${locator[k]}.`);
                        operation = await Docx.createP();
                        await operation.addText("Actual Result - ")
                        await operation.addText("Passed",{ color: '#008000', bold: true })
                        await operation.addImage(screenshotFilePath, {cx: 600, cy: 250})
                        }
                        catch(error)
                        {
                            keywordStatus[k] = 'Failed';
                            expect.soft(false).toBeTruthy();
                            //alert(`Exception - ${action[k]}_${locator[k]}`);
                         //   await page.waitForTimeout(10000);
                            screenshot = await actLib.captureScreenShot(action[k],locator[k])
                            operation = await Docx.createP();
                            operation = await Docx.createP();
                            await operation.addText(`${action[k]} ${locator[k]}.`);
                            operation = await Docx.createP();
                            await operation.addText("Actual Result - ")
                            await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                            await operation.addImage(screenshot, {cx: 600, cy: 250})
                            count = count + 1;
                            const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                            if (decision === 'exit') {
                                scenarioAboredByUser = true;
                                console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                                break;
                            }
                            console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                            alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
                        }
                        break;
        case "SwitchOut":
                    try{
                        keywordStatus[k] = 'Passed';
                        const fundSwitch = await actLib.fundSwitch()
                        for(let i=0;i<fundSwitch.screenshot.length;i++)
                        {
                            operation = await Docx.createP();
                            operation = await Docx.createP();
                            await operation.addText(`${fundSwitch.action[i]} ${fundSwitch.locator[i]}.`);
                            operation = await Docx.createP();
                            await operation.addText("Actual Result - ")
                            await operation.addText("Passed",{ color: '#008000', bold: true })
                            await operation.addImage(fundSwitch.screenshot[i], {cx: 600, cy: 250})
                        }
                        }
                        catch(error)
                        {
                            keywordStatus[k] = 'Failed';
                            expect.soft(false).toBeTruthy();
                            //alert(`Exception - ${action[k]}_${locator[k]}`);
                         //   await page.waitForTimeout(10000);
                            screenshot = await actLib.captureScreenShot(action[k],locator[k])
                            operation = await Docx.createP();
                            operation = await Docx.createP();
                            await operation.addText(`${action[k]} ${locator[k]}.`);
                            operation = await Docx.createP();
                            await operation.addText("Actual Result - ")
                            await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                            await operation.addImage(screenshot, {cx: 600, cy: 250})
                            count = count + 1;
                            const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                            if (decision === 'exit') {
                                scenarioAboredByUser = true;
                                console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                                break;
                            }
                            console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                            alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);
                        }
                        break;
        case "Wait":
                let sec= parseInt(locator[k]);
                await page.waitForTimeout(sec * 1000);  
                break; 
        case  undefined :
            break;                              
        default:    
                keywordStatus[k] = 'Failed';
                expect.soft(false).toBeTruthy();
                //alert(`Exception - ${action[k]}_${locator[k]}`); 
                screenshot = await actLib.captureScreenShot(action[k],locator[k])
                operation = await Docx.createP();
                operation = await Docx.createP();
                await operation.addText(`${action[k]} ${locator[k]}.`);
                operation = await Docx.createP();
                await operation.addText("Actual Result - ")
                await operation.addText("Failed",{ color: '#FF2C2C', bold: true })
                await operation.addImage(screenshot, {cx: 600, cy: 250})
                count = count + 1;
                const decision = await actLib.showKeywordFailurePrompt(page, `${action[k]}_${locator[k]}, Failed : Issue Occured. Please Check`);
                if (decision === 'exit') {
                    scenarioAboredByUser = true;
                    console.warn(`Scenario aborted by user: ${action[k]}_${locator[k]}`);
                    break;
                }
                console.warn(`⚠️ [${scenarioSet.ScenarioName}] Failed: ${action[k]}_${locator[k]}, continuing...`);
                alert(`[${scenarioSet.ScenarioName}] Exception - ${action[k]}_${locator[k]}`);      
                break;
    }
    if (count == 15) {
        console.warn(`Scenario aborted because the failure count reached ${count}.`);
        scenarioAboredByUser = true;
        break;
    }
}
    operation = await Docx.createP();
    await operation.addText('---');
    operation = await Docx.createP();
    await operation.addText('Keywords Summary:', { bold: true });
    for(let idx = 0; idx < action.length; idx++) {
        if (typeof action[idx] === 'undefined' || typeof locator[idx] === 'undefined') {
            continue;
        }
        let status = keywordStatus[idx] || 'Failed';
        await operation.addText(`${action[idx]}_${locator[idx]}: ${status} >`, { color: status === 'Passed' ? '#008000' : '#FF2C2C', bold: true });
    }
    const scenarioSummary = calculateScenarioResult({
        MODE: process.env.MODE || 'AUTO',
        OVERRIDE_STATUS: process.env.OVERRIDE_STATUS || scenarioSet.OVERRIDE_STATUS,
        keywordStatus: keywordStatus.filter((status) => typeof status !== 'undefined'),
    });
    runSummary.totalScenarios += 1;
    if (scenarioSummary.verdict === 'PASSED') {
        runSummary.passedScenarios += 1;
    } else {
        runSummary.failedScenarios += 1;
    }

    const workerIndex = process.env.PLAYWRIGHT_WORKER_INDEX || '0';
    const uniqueSuffix = `${workerIndex}_${Date.now()}`;
    const evidenceName = buildEvidenceFileName({
        scenarioName: scenarioSet.ScenarioName,
        status: scenarioSummary.verdict,
        timestamp: `${dateExecuted}-${monthExecuted+1}-${yearExecuted}_${hourExecuted}-${minuteExecuted}_${uniqueSuffix}`,
    });
    const docxPath = path.join(runResultDir, evidenceName);
    const out = fs.createWriteStream(docxPath);

    await new Promise((resolve, reject) => {
        out.on('error', reject);
        out.on('finish', resolve);
        Docx.generate(out);
    });

    runSummary.summaryRows.push({
        module: scenarioSet.Module || '',
        businessArea: scenarioSet.BusinessArea || '',
        scenarioName: scenarioSet.ScenarioName,
        status: scenarioSummary.verdict,
        attachment: evidenceName,
    });

    await attachGeneratedDocxIfConfigured(docxPath, scenarioSet.ScenarioName, scenarioSet, scenarioSummary);
    await page.close(); 
    // cleanupAfterDocOrBrowser();
})
}

test.afterAll(async () => {
    const targetIssueKey = resolveTargetIssueKey({
        TestExecutionKey: process.env.TEST_EXECUTION_KEY,
        JiraKey: process.env.JIRA_ISSUE_KEY,
    });

    if (!targetIssueKey || runSummary.totalScenarios === 0) {
        return;
    }

    const jiraConfig = getJiraConfig();
    await postJiraSummaryComment({
        issueKey: targetIssueKey,
        baseUrl: jiraConfig.baseUrl,
        email: jiraConfig.email,
        apiToken: jiraConfig.apiToken,
        summaryRows: runSummary.summaryRows,
    });
});

// test.afterAll(async () => {
//   await new Promise(resolve => {
//     cleanupAfterDocOrBrowser();
//     setTimeout(resolve, 7000);
//   });
// });

// test.afterEach(async ({}, testInfo) => {
//     // Copy all trace.zip files from test-results to temp-traces
//     const traceDirs = fs.readdirSync(testResultsDir, { withFileTypes: true })
//         .filter(dirent => dirent.isDirectory());
//     for (const dirent of traceDirs) {
//         const traceZipPath = path.join(testResultsDir, dirent.name, 'trace.zip');
//         if (fs.existsSync(traceZipPath)) {
//             const destPath = path.join(tempTracesDir, `${dirent.name}-trace.zip`);
//             fs.copyFileSync(traceZipPath, destPath);
//         }
//     }
// });
// // Patch Playwright's test.afterEach to copy trace zips after each scenario
// test.afterEach(async ({}, testInfo) => {
//     // Copy all trace.zip files from test-results to temp-traces
//     const traceDirs = fs.readdirSync(testResultsDir, { withFileTypes: true })
//         .filter(dirent => dirent.isDirectory());
//     for (const dirent of traceDirs) {
//         const traceZipPath = path.join(testResultsDir, dirent.name, 'trace.zip');
//         if (fs.existsSync(traceZipPath)) {
//             const destPath = path.join(tempTracesDir, `${dirent.name}-trace.zip`);
//             fs.copyFileSync(traceZipPath, destPath);
//         }
//     }
// });

