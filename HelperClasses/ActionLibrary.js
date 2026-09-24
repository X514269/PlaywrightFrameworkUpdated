const path = require('path');
const { expect } = require('@playwright/test');
const ExcelJS = require('exceljs');
const { dataSheetExcel, runResultDir, testResultsDir, uploadDocFile, uploadDiffFile } = require('../paths.config');

let screenshot;
let logArray = [];
const seenRequests = new Set();


class ActionLibrary
{
constructor(context, page)
{
    this.context = context;
    this.page = page;
    this._skipPrompts=false;
    this._failCount=0;
    this.MAX_FAILS=30;
    this.promptTimeout=30000; //30 seconds
}
//function to land on a particular URL
async openURL(action, website)
{
    if (website === "OMSA") {
        await this.page.goto("https://secure.advisorweb.snist.dev.oldmutual.co.za/dashboard/sales-dashboard", { waitUntil: 'load' });
    } else if (website === "OMSAMAX") {
        //await this.page.goto("https://secure.advisorweb.maxst.dev.oldmutual.co.za", { waitUntil: 'load' });
        //await this.page.goto("https://secure.advisorweb.maxst.dev.oldmutual.co.za", { waitUntil: 'load' });
        await this.page.goto("https://secure.advisorweb.snist.dev.oldmutual.co.za/dashboard/sales-dashboard", { waitUntil: 'load' });
        //await this.page.goto("https://secure.advisorweb.snist.dev.oldmutual.co.za/dashboard/sales-dashboard", { waitUntil: 'load' });
    } else if (website === "OMSADEV") {
        await this.page.goto("https://secure.advisorweb.snidev.dev.oldmutual.co.za/dashboard/sales-dashboard", { waitUntil: 'load' });
    }

    let screenshot;
    try {
        screenshot = await this.captureScreenShot(action, website);
    } catch (err) {
        console.warn(`Failed to capture screenshot after navigation to ${website}:`, err);
        screenshot = '';
    }
    return screenshot;
}
//function to enter some data in a field
async enterText(action,obName,loc,value)
{
    await expect(this.page.locator(loc)).toBeVisible();
    await expect(this.page.locator(loc)).toBeEditable();
    await this.page.locator(loc).clear();
    await this.highlightElement(loc);
    let cNum;
    let rNum; 
    let dataVal;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(dataSheetExcel);
    const worksheet = workbook.getWorksheet('WebEdit');
    worksheet.eachRow((row, rowNumber) =>
    {
    row.eachCell((cell, colNumber) =>
    {
        if(cell.value === obName)
        {
            cNum = colNumber;
        }
        else if(cell.value === value)
        {
            rNum = rowNumber;
        }
    })
    })
    dataVal = worksheet.getCell(rNum,cNum).value;
    dataVal = dataVal.toString();
    await this.page.locator(loc).fill(dataVal);
    //await this.page.waitForTimeout(2000);
    
    screenshot = this.captureScreenShot (action,obName)
    return {screenshot, dataVal};
}
//function to select a value from dropdown
async selectText(action, obName,loc,value)
{
    //await expect(this.page.locator(loc)).toBeVisible();
    await expect(this.page.locator(loc)).toBeEditable();
    await this.page.locator(loc).scrollIntoViewIfNeeded();
    //await this.highlightElement(loc);
    await this.highlightElement(loc);
    let cNum;
    let rNum; 
    let dataVal;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(dataSheetExcel);
    const worksheet = workbook.getWorksheet('WebList');
    worksheet.eachRow((row, rowNumber) =>
    {
    row.eachCell((cell, colNumber) =>
    {
        if(cell.value === obName)
        {
            cNum = colNumber;
        }
        else if(cell.value === value)
        {
            rNum = rowNumber;
        }    
    })
    })
    dataVal = worksheet.getCell(rNum,cNum).value;
    dataVal = dataVal.toString();
    await this.page.locator(loc).selectOption(dataVal,{timeout: 5000});
    //await this.page.waitForTimeout(2000);
    screenshot = await this.captureScreenShot(action,obName);
    return {screenshot,dataVal};
}
async onClickDiffFile(action, obName, loc)
{
    await expect(this.page.locator(loc)).toBeVisible();
    await expect(this.page.locator(loc)).toBeEnabled();
    await this.page.locator(loc).highlight();
    await this.page.locator(loc).click();
    await this.page.waitForTimeout(1000);
    await this.page.locator("[type='file']").setInputFiles("C:/Temp/ActionLibrary.js");
    await this.page.waitForTimeout(1000);
    screenshot = this.captureScreenShot (action,obName)
    return screenshot;
}
//function to click on an element
async onClick(action, obName, loc)
{
    await expect(this.page.locator(loc)).toBeVisible();
    //await expect(this.page.locator(loc)).toBeEnabled();
    await this.highlightElement(loc);
    await this.page.locator(loc).click();
    await this.page.waitForTimeout(1000);
    //await new Promise(resolve => setTimeout(resolve, 3000));
    screenshot = this.captureScreenShot (action,obName)
    return screenshot;
}
//function to select index 2 from a dropdown
async yearly(action, obName)
{
    const loc = '(//servicing-form-select/div/div/select)[2]';
    await expect(this.page.locator(loc)).toBeVisible();
    await expect(this.page.locator(loc)).toBeEnabled();
    await this.page.locator(loc).scrollIntoViewIfNeeded();
    await this.highlightElement(loc);
    await this.page.locator(loc).selectOption({index:2});
    await this.page.waitForTimeout(1000);
    screenshot = this.captureScreenShot (action,obName)
    return screenshot;
}
//function to open a new tab and land on servicing dashboard for SNI line
async tabChange(OR,action)
{
    await this.page.locator(".x-icon-menu").click();
    await this.page.getByText('EXISTING BUSINESS SERVICES DASHBOARD').click();
    const [newPage] = await Promise.all(
                                        [this.context.waitForEvent('page'),
                                        await this.page.getByText('OM Protect/Savings & Income').click()]
                                        );
    await this.page.close()
    this.page = newPage
    const page1 = this.page
    await OR.newTab(page1);
    let ORSheet = await OR.getORSheet(action,"ServiceDashboard")
    return {ORSheet,page1}
}
//function to open a new tab and land on servicing dashboard for GL line
async tabChangeGL(OR,action)
{
    await this.page.locator(".x-icon-menu").click();
    await this.page.getByText('EXISTING BUSINESS SERVICES DASHBOARD').click();
    const [newPage] = await Promise.all(
                                        [this.context.waitForEvent('page'),
                                        await this.page.getByText('Greenlight').click()]
                                        );
    await this.page.close()
    this.page = newPage
    const page1 = this.page
    await OR.newTab(page1);
    let ORSheet = await OR.getORSheet(action,"ServiceDashboard")
    return {ORSheet,page1}
}
//function to open a new tab and land on servicing dashboard for MAX Mig line
async tabChangeMAX(OR,action)
{
    await this.page.locator(".x-icon-menu").click();
    await this.page.getByText('EXISTING BUSINESS SERVICES DASHBOARD').click();
    const [newPage] = await Promise.all(
                                        [this.context.waitForEvent('page'),
                                        await this.page.getByText('CLOSED BOOK SAVINGS & INCOME').click()]
                                        );
    await this.page.close()
    this.page = newPage
    const page1 = this.page
    await OR.newTab(page1);
    let ORSheet = await OR.getORSheet(action,"ServiceDashboard")
    return {ORSheet,page1}
}
//function to open and check Open Money Account link
// async moneyAccountTab(OR,action)
// {
//     const page1 = this.page;
//     const [newPage] = await Promise.all(
//                                         [this.context.waitForEvent('page'),
//                                         await this.page.getByText('OPEN MONEY ACCOUNT').click()]
//                                         );
//     await OR.newTab(newPage);
//     let ORSheet = await OR.getORSheet(action,"OpenMoneyAccount");
//     await newPage.close();
//     this.page = page1;
//     await OR.newTab(page1);
//     return {ORSheet};
// }
async moneyAccountTab(OR,action)
{
    try {
        const page1 = this.page;
        // Wait for the tab to open, but timeout after 10 seconds
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout opening tab')), 10000));
        const [newPage] = await Promise.race([
            Promise.all([
                this.context.waitForEvent('page'),
                this.page.getByText('OPEN MONEY ACCOUNT').click()
            ]),
            timeoutPromise
        ]);
        await OR.newTab(newPage);
        let ORSheet = await OR.getORSheet(action, "OpenMoneyAccount");
        let screenshot = await this.captureScreenShot(action, "OpenMoneyAccount");
        await newPage.close();
        this.page = page1;
        await OR.newTab(page1);
        return { ORSheet: { ...ORSheet, screenshot, flagcheck: 0 } };
    } catch (error) {
        // If tab did not open, return 'no screenshot' and fail
        return { ORSheet: { screenshot: 'no screenshot', flagcheck: 1 } };
    }
}

//function to download a file from doc and forms modal
async downloadFile(action, obName, loc, scenarioName)
{
    await expect(this.page.locator(loc)).toBeVisible();
    await expect(this.page.locator(loc)).toBeEnabled();
    await this.highlightElement(loc);
    await this.page.locator(loc).click();
    const download = await this.page.waitForEvent('download');
    let docName = await this.page.locator(loc).innerText();
    const workerIndex = process.env.PLAYWRIGHT_WORKER_INDEX || '0';
    const uniqueSuffix = `${workerIndex}_${Date.now()}`;
    await download.saveAs(path.join(runResultDir, `${scenarioName}_${docName}_${uniqueSuffix}.pdf`));
    screenshot = await this.captureScreenShot(action,obName);
    return screenshot;
}
//fuction to open collection history page from sales dashboard
async tabChangeCollectionHistory(OR,action)
{
    await this.page.locator(".x-icon-menu").click();
    const [newPage] = await Promise.all(
                                        [this.context.waitForEvent('page'),
                                        await this.page.getByText('COLLECTION HISTORY').click()]
                                        );
    await this.page.close()
    this.page = newPage
    const page1 = this.page
    await OR.newTab(page1);
    let ORSheet = await OR.getORSheet(action,"CollectionHistory")
    return {ORSheet,page1}
}
//fuction to open conservation dashboard page from sales dashboard for SNI Line
async tabChangeConservation(OR,action)
{
    await this.page.locator(".x-icon-menu").click();
    await this.page.getByText('CONSERVATION').click();
    const [newPage] = await Promise.all(
                                        [this.context.waitForEvent('page'),
                                        await this.page.getByText('OM Protect/Savings & Income').click()]
                                        );
    await this.page.close()
    this.page = newPage
    const page1 = this.page
    await OR.newTab(page1);
    let ORSheet = await OR.getORSheet(action,"ConservationDashboard")
    return {ORSheet,page1}
}
async tabChangeMyTeam(OR,action)
{
    await this.page.locator(".x-icon-menu").click();
    await this.page.getByText('MY TEAM EXISTING BUSINESS').click();
    const [newPage] = await Promise.all(
                                        [this.context.waitForEvent('page'),
                                        await this.page.getByText('OM Protect/Savings & Income').click()]
                                        );
    await this.page.close()
    this.page = newPage
    const page1 = this.page
    await OR.newTab(page1);
    let ORSheet = await OR.getORSheet(action,"MyTeam")
    return {ORSheet,page1}
}
//fuction to open conservation dashboard page from sales dashboard for GL Line
async tabChangeConservationGL(OR,action)
{
    await this.page.locator(".x-icon-menu").click();
    await this.page.getByText('CONSERVATION').click();
    const [newPage] = await Promise.all(
                                        [this.context.waitForEvent('page'),
                                        await this.page.getByText('Greenlight').click()]
                                        );
    await this.page.close()
    this.page = newPage
    const page1 = this.page
    await OR.newTab(page1);
    let ORSheet = await OR.getORSheet(action,"ConservationDashboard")
    return {ORSheet,page1}
}
//function to capture screenshot of a particular page
// async captureScreenShot(action,loc)
// {
//     const currentDate = new Date();
//     const timestamp = currentDate.getTime();
//     const ssfilepath = 'D:/Users/X514269/OneDrive - Old Mutual/Desktop/PlaywrightFrameworkUpdated/test-results';
//     const workerIndex = process.env.PLAYWRIGHT_WORKER_INDEX || '0';
//     const screenshotFilePath = `${ssfilepath}/screenshot_${action}_${loc}_${timestamp}_${workerIndex}.png`;
//     await this.page.screenshot({ path: screenshotFilePath })
//     return screenshotFilePath
// }
//function to capture screenshot of a particular page
async captureScreenShot(action,loc)
{
    // Create a human-readable timestamp
    const currentDate = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const formatted = `${pad(currentDate.getDate())}-${pad(currentDate.getMonth()+1)}-${currentDate.getFullYear()}_${pad(currentDate.getHours())}-${pad(currentDate.getMinutes())}-${pad(currentDate.getSeconds())}`;
    const timestamp = currentDate.getTime();
 
    // Inject a small fixed-position timestamp element into the page so it appears on the screenshot
    try {
        await this.page.evaluate(({ formatted }) => {
            let el = document.getElementById('e2e-screenshot-timestamp');
            if (!el) {
                el = document.createElement('div');
                el.id = 'e2e-screenshot-timestamp';
                el.style.position = 'fixed';
                el.style.zIndex = '9999999';
                // Position bottom-center
                el.style.left = '50%';
                el.style.bottom = '8px';
                el.style.transform = 'translateX(-50%)';
                // Styling for readability on varied backgrounds
                el.style.padding = '4px 10px';
                el.style.background = 'rgba(0,0,0,0.6)';
                el.style.color = '#fff';
                el.style.fontSize = '12px';
                el.style.borderRadius = '4px';
                el.style.pointerEvents = 'none';
                el.style.textAlign = 'center';
                el.style.maxWidth = '80%';
                el.style.whiteSpace = 'nowrap';
                document.body.appendChild(el);
            }
            el.textContent = formatted;
        }, { formatted });
    } catch (err) {
        // If injecting fails, continue and still take the screenshot
        console.warn('Failed to inject timestamp into page for screenshot:', err);
    }
 
    const ssfilepath = testResultsDir;
    const screenshotFilePath = `${ssfilepath}/screenshot_${action}_${loc}_${timestamp}.png`;
    await this.page.screenshot({ path: screenshotFilePath })
 
    // Remove the injected timestamp element (best-effort)
    try {
        await this.page.evaluate(() => {
            const el = document.getElementById('e2e-screenshot-timestamp');
            if (el) el.remove();
        });
    } catch (err) {
        // ignore
    }

    // Clear any element highlight added for screenshot or step visibility
    try {
        await this.page.evaluate(() => {
            const highlighted = document.querySelectorAll('[data-e2e-highlight="true"]');
            highlighted.forEach(el => {
                el.removeAttribute('data-e2e-highlight');
                if (el.style.outline === '3px solid blue') el.style.outline = '';
                if (el.style.border === '3px solid blue') el.style.border = '';
                if (el.style.zIndex === '999999') el.style.zIndex = '';
            });
        });
    } catch (err) {
        // ignore
    }
 
    // Return the screenshot path and the visible timestamp (caller can use if needed)
    return screenshotFilePath
}
//function to upload a file
async onClickUploadDoc(action, obName, loc) {
    // await expect(this.page.locator(loc)).toBeVisible();
    // await expect(this.page.locator(loc)).toBeEnabled();
    // await this.page.locator(loc).highlight();
    // await this.page.locator(loc).click();
    // await this.page.waitForTimeout(1000);
    // await this.page.locator("[type='file']").setInputFiles("C:/Temp/sticky1.pdf");
    // await this.page.waitForTimeout(1000);
    // screenshot = this.captureScreenShot (action,obName)
    // return screenshot;


    await expect(this.page.locator(loc)).toBeVisible();
    await expect(this.page.locator(loc)).toBeEnabled();
    await this.highlightElement(loc);
    await this.page.locator(loc).click();
    await this.page.waitForTimeout(1000);
    await this.page.locator("[type='file']").setInputFiles(uploadDocFile);
    await this.page.waitForTimeout(1000);
    const screenshot = await this.captureScreenShot(action, obName);
    return screenshot;
}
//function to upload a file for specific page
async onClickIEAddFile(action, obName, loc)
{
    await expect(this.page.locator(loc)).toBeVisible();
    await expect(this.page.locator(loc)).toBeEnabled();
    await this.highlightElement(loc);
    await this.page.waitForTimeout(1000);
    const fileChooser = this.page.waitForEvent('filechooser');
    await this.page.locator(loc).click();
    const fileCh = await fileChooser;
    await fileCh.setFiles(uploadDocFile);
    await this.page.waitForTimeout(1000);
    screenshot = this.captureScreenShot(action,obName);
    return screenshot;
}
//function to upload a Not supported File.
async onClickUploadDiff(action, obName, loc) {
    await expect(this.page.locator(loc)).toBeVisible();
    await expect(this.page.locator(loc)).toBeEnabled();
    await this.highlightElement(loc);
    await this.page.locator(loc).click();
    await this.page.waitForTimeout(1000);
    await this.page.locator("[type='file']").setInputFiles(uploadDiffFile);
    await this.page.waitForTimeout(1000);
    const screenshot = await this.captureScreenShot(action, obName);
    return screenshot;
}
//function to highlight and check whether an element is present on page
async checkElement(action, obName, loc)
{
    await expect(this.page.locator(loc)).toBeVisible();
    await this.page.locator(loc).scrollIntoViewIfNeeded();
    await this.highlightElement(loc);
    await this.page.waitForTimeout(1000);
    screenshot = this.captureScreenShot (action,obName)
    return screenshot;
}
//function to check whether a field or dropdown is disabled
async checkNotElement(action, obName, loc)
{   
    await expect(this.page.locator(loc)).toBeDisabled();
    await this.page.locator(loc).scrollIntoViewIfNeeded();
    await this.highlightElement(loc);
    await this.page.waitForTimeout(1000);
    screenshot = this.captureScreenShot (action,obName)
    return screenshot;
}
//function to highlight element
async highlightElement(loc)
{
    await expect(this.page.locator(loc)).toBeVisible();
    //await this.page.locator(loc).first().highlight();
    //await this.page.waitForTimeout(500);
    await this.page.locator(loc).evaluate((el)=>{
        el.style.border = '3px solid blue';
      });
}
//function to do operations on CAR page with 2 questions
async carPageAction()
{
    let screenshot = []
    let action = []
    let locator = []
    await this.highlightElement("text='CUSTOMER ADVICE RECORD'");
    screenshot [0] = await this.captureScreenShot("Navigate","CarPage")
    action [0] = "Navigate"
    locator [0] = "CarPage"
    await this.highlightElement("text='FINANCIAL PLAN'")
    screenshot [1]= await this.captureScreenShot("Check","Financial Tab")
    action [1] = "Check"
    locator [1] = "Financial Tab"
    await this.highlightElement("text='ADVICE DETAILS'")
    screenshot [2]= await this.captureScreenShot("Check","Advice Details Tab")
    action [2] = "Check"
    locator [2] = "Advice Details Tab"
    await this.highlightElement("text='TRANSACTION(S)'")
    screenshot [3]= await this.captureScreenShot("Check","Transaction Tab")
    action [3] = "Check"
    locator [3] = "Transaction Tab"
    await this.page.locator("//h3[contains(text(),'ADVICE DETAILS')]//following::div[8]").click()
    screenshot [4]= await this.captureScreenShot("Click","Question1Yes")
    action [4] = "Click"
    locator [4] = "Question1Yes"
    await this.page.locator("//h3[contains(text(),'ADVICE DETAILS')]//following::div[16]").click()
    screenshot [5]= await this.captureScreenShot("Click","Question2Yes")
    action [5] = "Click"
    locator [5] = "Question2Yes"
    await this.highlightElement("text='IMPLICATION & RECOMMENDATION '")
    screenshot [6]= await this.captureScreenShot("Check","Implication Tab")
    action [6] = "Check"
    locator [6] = "Implication Tab"
    await this.page.locator("[placeholder*='Type the <Implication of Transaction(s)>']").fill("Implication")
    screenshot [7]= await this.captureScreenShot("Enter","Implication Text")
    action [7] = "Enter"
    locator [7] = "Implication Text"
    await this.page.locator("[placeholder*='Type <Reason for Recommendation>']").fill("Reason For Recommendation")
    screenshot [8]= await this.captureScreenShot("Enter","Recommendation Text")
    action [8] = "Enter"
    locator [8] = "Recommendation Text"
    await this.page.locator(".next-btn").click()
    screenshot [9]= await this.captureScreenShot("Click","Save Button")
    action [9] = "Click"
    locator [9] = "Save Button"
    await this.page.locator(".next-btn").click()
    screenshot [10]= await this.captureScreenShot("Click","Next Button")
    action [10] = "Click"
    locator [10] = "Next Button"
        
    return {screenshot, action, locator}
}
//function to do operations on CAR page with 3 questions
async carPageActionnew()
{
    let screenshot = []
    let action = []
    let locator = []
    await this.highlightElement("text='CUSTOMER ADVICE RECORD'");
    screenshot [0] = await this.captureScreenShot("Navigate","CarPage")
    action [0] = "Navigate"
    locator [0] = "CarPage"
    await this.highlightElement("text='FINANCIAL PLAN'")
    screenshot [1]= await this.captureScreenShot("Check","Financial Tab")
    action [1] = "Check"
    locator [1] = "Financial Tab"
    await this.highlightElement("text='ADVICE DETAILS'")
    screenshot [2]= await this.captureScreenShot("Check","Advice Details Tab")
    action [2] = "Check"
    locator [2] = "Advice Details Tab"
    await this.highlightElement("text='TRANSACTION(S)'")
    screenshot [3]= await this.captureScreenShot("Check","Transaction Tab")
    action [3] = "Check"
    locator [3] = "Transaction Tab"
    await this.page.locator("//h3[contains(text(),'ADVICE DETAILS')]//following::div[8]").click()
    screenshot [4]= await this.captureScreenShot("Click","Question1Yes")
    action [4] = "Click"
    locator [4] = "Question1Yes"
    await this.page.locator("//h3[contains(text(),'ADVICE DETAILS')]//following::div[16]").click()
    screenshot [5]= await this.captureScreenShot("Click","Question2Yes")
    action [5] = "Click"
    locator [5] = "Question2Yes"
    await this.page.locator("//h3[contains(text(),'ADVICE DETAILS')]//following::div[26]").click()
    screenshot [6]= await this.captureScreenShot("Click","Question3Yes")
    action [6] = "Click"
    locator [6] = "Question3Yes"
    await this.highlightElement("text='IMPLICATION & RECOMMENDATION '")
    screenshot [7]= await this.captureScreenShot("Check","Implication Tab")
    action [7] = "Check"
    locator [7] = "Implication Tab"
    await this.page.locator("[placeholder*='Type the <Implication of Transaction(s)>']").fill("Implication")
    screenshot [8]= await this.captureScreenShot("Enter","Implication Text")
    action [8] = "Enter"
    locator [8] = "Implication Text"
    await this.page.locator("[placeholder*='Type <Reason for Recommendation>']").fill("Reason For Recommendation")
    screenshot [9]= await this.captureScreenShot("Enter","Recommendation Text")
    action [9] = "Enter"
    locator [9] = "Recommendation Text"
    await this.page.locator(".next-btn").click()
    screenshot [10]= await this.captureScreenShot("Click","Save Button")
    action [10] = "Click"
    locator [10] = "Save Button"
    await this.page.locator(".next-btn").click()
    screenshot [11]= await this.captureScreenShot("Click","Next Button")
    action [11] = "Click"
    locator [11] = "Next Button"  
    return {screenshot, action, locator}
}
//function to capture SR Number
// async captureSr(action, obName, loc)
// {  
//     await expect(this.page.locator(loc)).toBeVisible();
//     await this.page.locator(loc).scrollIntoViewIfNeeded();
//     await this.page.waitForTimeout(1000);
//     await this.highlightElement(loc);
//     let SRNum = await this.page.locator(loc).innerText();
//     SRNum = SRNum.split(":");
//     SRNum = SRNum[1];
//     SRNum = SRNum.trim();
//     console.log(SRNum);
//     screenshot = this.captureScreenShot (action,obName)
//     return {screenshot,SRNum};
// }
//function to capture SR Number
async captureSr(action, obName, loc)
{  
    await expect(this.page.locator(loc)).toBeVisible();
    await this.page.locator(loc).scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(1000);
    await this.highlightElement(loc);
    let SRNum = await this.page.locator(loc).innerText();
    SRNum = SRNum.split(":");
    SRNum = SRNum[1];
    SRNum = SRNum.split("(");
    SRNum = SRNum[0];
    SRNum = SRNum.trim();
    console.log(SRNum);
    screenshot = this.captureScreenShot (action,obName)
    return {screenshot,SRNum};
}
//function to enter the captured SR Number
async enterData(action, obName, loc, SRNum)
{  
    await expect(this.page.locator(loc)).toBeVisible();
    //await this.page.waitForTimeout(1000);
    await this.highlightElement(loc);
    await this.page.locator(loc).fill(SRNum);
    screenshot = this.captureScreenShot (action,obName)
    return screenshot;
}
async TabChange(OR,action,locator,loc)
{
    const page1 = this.page;
    const [newPage] = await Promise.all(
                                        [this.context.waitForEvent('page'),
                                        this.page.locator(loc).click()]
                                        );
    await OR.newTab(newPage);
    
    screenshot = this.captureScreenShot (action,obName)
    let ORSheet = await OR.getORSheet(action,locator);
    await newPage.close();
    this.page = page1;
    await OR.newTab(page1);
    return { ORSheet, screenshot };
}
async generateRandomName(action,obName,loc) 
{
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';  // Alphabet from A to Z
        let randomName = '';
        let i = 0;
        for (i = 0; i < 4; i++) {
          const randomIndex = Math.floor(Math.random() * alphabet.length);
          
          randomName += alphabet[randomIndex]; 
        //console.log(randomName); 
        }
        console.log(randomName);
        //await expect(this.page.locator(loc)).toBeVisible();
        //await expect(this.page.locator(loc)).toBeEditable();
        //await this.page.locator(loc).clear();
        await this.highlightElement(loc);
        await this.page.locator(loc).fill(randomName);
        screenshot = this.captureScreenShot (action,obName)
        return screenshot;
  } 
async scrollToElement(page, locator) {
    await page.evaluate((locator) => {
        const element = document.querySelector(locator);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            throw new Error(`Element with selector "${selector}" not found.`);
        }
    }, locator);
}
async archiveSearchNum(loc)
{
    await expect(this.page.locator(loc)).toBeVisible();
    //await this.page.waitForTimeout(1000);
    await this.highlightElement(loc);
    let AppNum = await this.page.locator(loc).innerText();
    screenshot = this.captureScreenShot (action,obName)
    return {screenshot,AppNum};

}
async EnterAppNum(action, obName, loc, aNum)
{
    //await expect(this.page.locator(loc)).toBeVisible();
    //await this.page.waitForTimeout(1000);
   await this.highlightElement(loc);
    await this.page.locator(loc).fill(aNum);
    screenshot = this.captureScreenShot (action,obName)
    return screenshot;

}
//function to hover on an element and check if value is getting displayed
async hoverElement(action, obName, loc)
{
    await expect(this.page.locator(loc)).toBeVisible();
    //await expect(this.page.locator(loc)).toBeEnabled();
    await this.highlightElement(loc);
    await this.page.locator(loc).hover();
    //let HoverVal = await this.page.locator(loc).innerText();
    //await expect(this.page.locator(loc)).not.toBeEmpty();
    //console.log(HoverVal);
    //await this.page.waitForTimeout(1000);
    screenshot = this.captureScreenShot (action,obName)
    return screenshot;
}


//function to capture api details
 //const logArray = [];
async captureFailedAPIs(page) {
    

    return new Promise((resolve) => {
        page.on('response', async (response) => {
                const request = response.request();
                const key = `${request.method()}|${response.url()}`;

                // Deduplicate based on method + URL
                if (response.status() >= 400 && !seenRequests.has(key)) {
                    seenRequests.add(key);

                    let responseBody = '';
                    try {
                        const buffer = await response.body(); // Use .body() instead of .buffer()
                        const contentType = response.headers()['content-type'] || '';

                        if (contentType.includes('application/json')) {
                            responseBody = JSON.parse(buffer.toString());
                        } else if (contentType.includes('text') || contentType.includes('html')) {
                            responseBody = buffer.toString();
                        } else {
                            responseBody = 'Binary or unsupported format';
                        }
                    } catch (err) {
                        responseBody = 'Unable to read response body';
                    }

                    const logEntry = {
                        URL: response.url(),
                        Method: request.method(),
                        Status: response.status(),
                        RequestHeaders: request.headers(),
                        RequestBody: JSON.parse(request.postData()) || 'No body',
                        ResponseHeaders:response.headers(),
                        ResponseBody: responseBody
                    };

                    logArray.push(logEntry);
                }
            
        });

        // Wait for responses to settle
        setTimeout(() => {
            resolve(logArray);
        }, 5000);
    });
}

async fundSwitch()
{
    let screenshot = []
    let action = []
    let locator = []
    let val
    let NoOfUnits = await this.page.locator("(//div[contains(@class,'x-items-start')]/span[contains(@class,'overflow')])[1]").innerText();
    NoOfUnits = NoOfUnits.toString().split(".");
    NoOfUnits = NoOfUnits[0];
    NoOfUnits = NoOfUnits.trim();
    NoOfUnits = parseInt(NoOfUnits)
    let InvFundValue = await this.page.locator("(//div[contains(@class,'x-items-end')]/span[contains(@class,'overflow')])[1]").innerText();
    InvFundValue = InvFundValue.toString().split(".");
    InvFundValue = InvFundValue[0];
    InvFundValue = InvFundValue.trim();
    InvFundValue = parseInt(InvFundValue)
    let testData1 = (NoOfUnits/InvFundValue)*(InvFundValue-146)
    testData1 = testData1.toString().split(".");
    testData1 = testData1[0];
    let testData2 = (NoOfUnits/InvFundValue)*(146)
    testData2 = testData2.toString().split(".");
    testData2 = testData2[0];
    await this.page.locator("//select").selectOption("Amount")
    screenshot [0]= await this.captureScreenShot("Select","Amount")
    action [0] = "Select"
    locator [0] = "Amount"
    await this.page.locator("(//input)[3]").fill("150")
    screenshot [1]= await this.captureScreenShot("Enter","AmountVal1")
    action [1] = "Enter"
    locator [1] = "AmountVal1"
    await this.page.locator("(//input)[3]").fill("149")
    screenshot [2]= await this.captureScreenShot("Enter","AmountVal2")
    action [2] = "Enter"
    locator [2] = "AmountVal2"
    val = InvFundValue-149
    val = val.toString();
    await this.page.locator("(//input)[3]").fill(val)
    screenshot [3]= await this.captureScreenShot("Enter","AmountVal3")
    action [3] = "Enter"
    locator [3] = "AmountVal3"
    val = InvFundValue-150
    val = val.toString();
    await this.page.locator("(//input)[3]").fill(val)
    screenshot [4]= await this.captureScreenShot("Enter","AmountVal4")
    action [4] = "Enter"
    locator [4] = "AmountVal4"
    val = InvFundValue+1
    val = val.toString();
    await this.page.locator("(//input)[3]").fill(val)
    screenshot [5]= await this.captureScreenShot("Enter","AmountVal5")
    action [5] = "Enter"
    locator [5] = "AmountVal5"
    await this.page.locator("//select").selectOption("No of Units")
    screenshot [6]= await this.captureScreenShot("Select","NoOfUnits")
    action [6] = "Select"
    locator [6] = "NoOfUnits"
    await this.page.locator("(//input)[3]").fill(testData1)
    screenshot [7]= await this.captureScreenShot("Enter","UnitVal1")
    action [7] = "Enter"
    locator [7] = "UnitVal1"
    await this.page.locator("(//input)[3]").fill(testData2)
    screenshot [8]= await this.captureScreenShot("Enter","UnitVal2")
    action [8] = "Enter"
    locator [8] = "UnitVal2"
    val = NoOfUnits+1
    val = val.toString();
    await this.page.locator("(//input)[3]").fill(val)
    screenshot [9]= await this.captureScreenShot("Enter","UnitVal3")
    action [9] = "Enter"
    locator [9] = "UnitVal3"
    await this.page.locator("//select").selectOption("Percentage")
    screenshot [10]= await this.captureScreenShot("Select","Percentage")
    action [10] = "Select"
    locator [10] = "Percentage"
    await this.page.locator("(//input)[3]").fill("101")
    screenshot [11]= await this.captureScreenShot("Enter","PercentageVal1")
    action [11] = "Enter"
    locator [11] = "PercentageVal1"
    await this.page.locator("(//input)[3]").fill("100")
    screenshot [12]= await this.captureScreenShot("Enter","PercentageVal2")
    action [12] = "Enter"
    locator [12] = "PercentageVal2"
    return {screenshot, action, locator}
}
// Reset before each scenario
resetFailCount(){
    this._failCount=0;
    this._skipPrompts=false;
}
// Show prompt in browser
async showKeywordFailurePrompt(page, msg) {
    this._failCount++;
    if (this._failCount >= this.MAX_FAILS) {
        console.error(`❌ ${this.MAX_FAILS} consecutive keyword failures. Aborting scenario...`);
        return 'exit';
    }
    // Show prompt only on keyword failure
    let interruptHandler;
    const interruptPromise = new Promise((resolve) => {
        interruptHandler = () => {
            page.evaluate(() => {
                clearTimeout(window._kwTimer);
                document.getElementById('kw-modal')?.remove();
            }).catch(() => {});
            resolve('exit');
        };
        process.once('SIGINT', interruptHandler);
    });

    const choice = await Promise.race([
        page.evaluate(({ message, failCount, MAX_FAILS, timeout }) => {
            return new Promise(resolve => {
                if (document.getElementById('kw-modal')) {
                    document.getElementById('kw-modal').remove();
                }
                document.body.insertAdjacentHTML(
                    'beforeend',
                    `<div id="kw-modal" style="position:fixed;top:30%;left:50%;transform:translateX(-50%);
                    background:#fff;border:2px solid #000;padding:1em;z-index:99999;text-align:center;
                    box-shadow:0 4px 12px rgba(0,0,0,0.3)">
                        <b>Keyword Failure!</b>
                        (${failCount}/${MAX_FAILS})<br>${message}<br><br>
                        <button id="kw-count">Continue (C)</button>
                        <button id="kw-exit">Exit (E)</button>
                        <div style="margin-top:8px;color:#666">Auto-continuing in ${timeout/1000}...</div>
                    </div>`
                );
                // Main end/resolve function
                window._kwDecision = null;
                const end = val => {
                    window._kwDecision = val;
                    document.getElementById('kw-modal')?.remove();
                    resolve(val);
                };

                // Always provide keyboard shortcut fallback
                window.addEventListener('keydown', e => {
                    if (e.ctrlKey || e.metaKey) return;
                    if (['c', 'C'].includes(e.key)) {clearTimeout(window._kwTimer); end('continue');}
                    if (['e', 'E'].includes(e.key)) {clearTimeout(window._kwTimer); end('exit');}
                });
                //Defensive button setup in try/catch
                try {
                    const btnContinue = document.getElementById('kw-count')
                    if(btnContinue) btnContinue.onclick = () => {clearTimeout(window._kwTimer); end('continue');}
                    
                    const btnExit = document.getElementById('kw-exit')
                    if(btnExit) btnExit.onclick = () => {clearTimeout(window._kwTimer); end('exit');}
                } catch (error) {
                    console.error('Error setting up buttons:', error);
                }
                // Auto-continue after timeout
                window._kwTimer = setTimeout(() => end('continue'), timeout);
            });
        }, { message: msg, failCount: this._failCount, MAX_FAILS: this.MAX_FAILS, timeout: this.promptTimeout||30000 }),
        interruptPromise
    ]);

    if (interruptHandler) {
        process.removeListener('SIGINT', interruptHandler);
    }

    // Clear timeout and remove modal if still present
    await page.evaluate(() => { clearTimeout(window._kwTimer); 
        document.getElementById('kw-modal')?.remove();
    });
    // If continue, immediately go to next keyword; if exit, return exit
    return choice;
}

// Function to inject scenario name overlay on the page
async injectScenarioName(scenarioName) {
    await this.page.evaluate((name) => {
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = 'scenario-name-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background-color: rgba(0, 0, 0, 0.8);
            color: #00FF00;
            padding: 10px 15px;
            border-radius: 5px;
            font-size: 14px;
            font-weight: bold;
            z-index: 10000;
            font-family: monospace;
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        `;
        overlay.textContent = `Scenario: ${name}`;
        document.body.appendChild(overlay);
    }, scenarioName);
}

// Function to remove scenario name overlay from the page
async removeScenarioName() {
    await this.page.evaluate(() => {
        const overlay = document.getElementById('scenario-name-overlay');
        if (overlay) {
            overlay.remove();
        }
    });
}
}



module.exports = {ActionLibrary};