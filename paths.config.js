const path = require('path');

const projectDir = path.resolve(__dirname);
const desktopDir = path.resolve('C:/Users/X514269/OneDrive - Old Mutual/Desktop');

module.exports = {
  projectDir,
  desktopDir,
  keywordsExcel: path.join(desktopDir, 'Keywords.xlsx'),
  orExcel: path.join(desktopDir, 'OR.xlsx'),
  dataSheetExcel: path.join(desktopDir, 'DataSheet.xlsx'),
  runResultDir: path.join(projectDir, 'RunResult'),
  testResultsDir: path.join(projectDir, 'test-results'),
  uploadDocFile: path.resolve('C:/Temp/sticky1.pdf'),
  uploadDiffFile: path.resolve('C:/Temp/ActionLibrary.js'),
};
