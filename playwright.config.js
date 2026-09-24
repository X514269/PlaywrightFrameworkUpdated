const { defineConfig } = require('@playwright/test');
 
module.exports = defineConfig({
  globalSetup: './global-setup.js',
  testDir: './tests',
  timeout: 120*10000,
  workers: 2,
  fullyParallel: true,
  expect:{
    timeout: 20000
  },
  reporter: [['html',{open: 'never'}]],
  projects: [
    {
      use: {
      channel: "msedge",
      headless: false,
      viewport: null,
      launchOptions:{
        args:["--start-maximized"],
      },
      screenshot: 'on',
      trace: 'on'
    },
    },
  ],
});