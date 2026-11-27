import { memberships } from './helpers/dashboardFixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playground, baseUrl } from './helpers/conversationFixture.mjs';

test('published selector creates playground and renders complete response without simulated streaming',async(t)=>{
 const {page}=await playground(t);await page.goto(`${baseUrl}/conversations`);await page.locator('#playground-assistant').selectOption('a');
 await page.getByRole('button',{name:'New conversation',exact:true}).click();await page.getByLabel('Message to assistant').fill('Hello');
 await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('Mock response for browser verification',{exact:true}).waitFor();
 assert.equal(await page.locator('.conversation-bubble').count(),2);assert.equal(await page.getByLabel('Message to assistant').inputValue(),'');
});
test('failed turn retains text and retry uses the same logical key',async(t)=>{
 const {page,calls}=await playground(t,{turnHandler:route=>route.fulfill({status:503,json:{error:{code:'AI_SERVICE_UNAVAILABLE',message:'AI service unavailable.'}}})});
 await page.goto(`${baseUrl}/conversations?workspace=business-a&conversation=c`);await page.getByLabel('Message to assistant').fill('Retain this question');
 await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('Conversation request failed',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Message to assistant').inputValue(),'Retain this question');
 await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('AI service unavailable.',{exact:true}).waitFor();
 const turns=calls.filter(c=>c.path.endsWith('/turns'));assert.equal(turns.length,2);assert.equal(turns[0].headers['idempotency-key'],turns[1].headers['idempotency-key']);
});
test('generating state prevents duplicate submissions and late replies cannot cross workspaces',async(t)=>{
 const deferred=Promise.withResolvers();
 const {page,calls}=await playground(t,{turnHandler:async route=>{await deferred.promise;return route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Late failure'}}});}});t.after(()=>deferred.resolve());
 await page.goto(`${baseUrl}/conversations?workspace=business-a&conversation=c`);await page.getByLabel('Message to assistant').fill('Hello');await page.getByRole('button',{name:'Send message',exact:true}).click();
 assert.equal(await page.locator('.conversation-composer button[type=submit]').isDisabled(),true);assert.equal(calls.filter(c=>c.path.endsWith('/turns')).length,1);
 await page.locator('#workspace-switcher-select').selectOption('business-b');deferred.resolve();
 await page.getByRole('heading',{name:'AI Playground',exact:true}).waitFor();assert.equal(await page.getByText('Hello',{exact:true}).count(),0);
});
test('operators can change statuses but have no destructive actions',async(t)=>{
 const {page}=await playground(t,{businesses:[{...memberships[0],role:'operator'}]});await page.goto(`${baseUrl}/conversations?workspace=business-a&conversation=c`);await page.locator('#conversation-status').selectOption('closed');
 await page.waitForFunction(()=>document.querySelector('#conversation-status')?.value==='closed');assert.equal(await page.getByLabel('Message to assistant').isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Purge permanently',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Delete',exact:true}).count(),0);
});
test('desktop tablet and mobile conversation layouts have no page overflow',async(t)=>{
 const {page}=await playground(t);await page.goto(`${baseUrl}/conversations?workspace=business-a&conversation=c`);await page.getByLabel('Message to assistant').waitFor();
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.getByRole('button',{name:'Use dark theme',exact:true}).click();await page.screenshot({path:'/tmp/conversations-mobile.png',fullPage:true,animations:'disabled'});
});
