import {defineConfig,devices} from '@playwright/test';
import {loadEnvConfig} from '@next/env';
loadEnvConfig(process.cwd());
const proxyUrl=process.env.TIDALIS_BROWSER_USE_ENV_PROXY==='true'&&process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:process.env.TIDALIS_TEST_BASE_URL||'http://127.0.0.1:3000',trace:'retain-on-failure',
    proxy:proxyUrl?{server:proxyUrl.origin,username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password),bypass:'127.0.0.1,localhost'}:undefined,
    launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{
      executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']
    }:undefined},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:process.env.TIDALIS_TEST_BASE_URL?undefined:{
    command:'npm run start -- --hostname 127.0.0.1',url:'http://127.0.0.1:3000/login',reuseExistingServer:!process.env.CI,timeout:60000
  }
});
