const ExcelJS = require('exceljs');
const { expect } = require('@playwright/test');
const { alert } = require('vscode-websocket-alerts');
const { ActionLibrary } = require('./ActionLibrary');
const { orExcel } = require('../paths.config');
let actLib, flagcheck = 0;

class ORHandler
{
  constructor(context, page)
  {
    this.context=context;
    this.page=page;
  }
//function to load OR Sheet and highlight header
async getORSheet(action, worksheet)
{
    actLib = new ActionLibrary(this.context, this.page);
    let obName = [];
    let obRef = [];
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(orExcel);
    const worksheet1 = workbook.getWorksheet(worksheet);
    let i = 0;
    let j = 0;
    let k = 0;
    worksheet1.eachRow((row,rowNumber) =>
    {
          row.eachCell((cell,colNumber) =>
          {
              if(colNumber == 1 && cell.value!="..ObjName")
              {
                obName[i] = cell.value;
                if(obName[i] === "Header")
                {
                  k=i;
                }
                i=i+1;
              }
              if(colNumber == 2 && cell.value!="LocatorValue")
              {
                obRef[j] = cell.value;
                j=j+1;
              }
          }  )
    })
    try
    {
      //highlight header of a web page
      await expect(this.page.locator(obRef[k])).toBeVisible();
      await this.page.locator(obRef[k]).evaluate((el)=>{
      el.style.border = '3px solid blue';});
      //await this.highlightElement(obRef[k]);
      flagcheck=0;
    }
    catch(error)
    {
      expect.soft(false).toBeTruthy();
      alert(`Exception - ${action}_${worksheet}`);
      //await this.page.waitForTimeout(10000);
      flagcheck=1;
    }
    const screenshot = await actLib.captureScreenShot(action, worksheet);    
   // await this.page.waitForTimeout(2000);
    return {screenshot,obName,obRef,flagcheck};
}
//function to load new tab properties
async newTab(newPage)
{
  this.page = newPage;
}
}
module.exports = {ORHandler};