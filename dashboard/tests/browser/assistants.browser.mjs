import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, memberships, baseUrl } from './helpers/dashboardFixture.mjs';

test('assistant empty state, owner form validation and responsive themes',async(t)=>{
 const {page}=await fixture(t);await page.goto(`${baseUrl}/assistants`);
 await page.getByText('No assistants yet.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Create assistant',exact:true}).click();
 await page.getByLabel('Assistant name').waitFor();
 assert.equal(await page.getByRole('button',{name:'Save Draft',exact:true}).count(),1);
 for(const width of [1440,768,390]) {await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.getByRole('button',{name:'Use dark theme',exact:true}).click();
 await page.screenshot({path:'/tmp/assistants-dark.png',fullPage:true,animations:'disabled'});
});
test('operator assistant view offers no creation or write controls',async(t)=>{
 const {page}=await fixture(t,{role:'operator'});await page.goto(`${baseUrl}/assistants`);
 await page.getByText('Read-only operator access',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Create assistant',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Save Draft',exact:true}).count(),0);
});
const draft = {id:'v',assistantId:'a',businessId:'business-a',versionNumber:1,status:'draft',publishedAt:null,createdAt:'2026-11-27',updatedAt:'2026-11-27',displayName:'Test Assistant',description:null,systemInstructions:'Help customers.',language:'en',tone:'professional',welcomeMessage:'Hello',fallbackMessage:'Contact us',modelSettings:{temperature:0.2,maxOutputTokens:512,maxContextMessages:10},allowedTools:[],allowedKnowledgeScopes:['public'],knowledgeLocationScope:'business_wide',knowledgeLocationIds:[]};
const assistant = {id:'a',businessId:'business-a',scope:'business',locationId:null,draftVersion:draft,publishedVersion:null};
test('draft rendering and publish confirmation preserve draft after server conflict',async(t)=>{
 const {page}=await fixture(t);let publications=0;
 await page.route('**/api/v1/businesses/business-a/assistants**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path.endsWith('/tools')) return route.fulfill({json:{tools:[]}});
 if(path.endsWith('/publish')) {publications++;return route.fulfill({status:409,json:{error:{code:'CONFLICT',message:'Draft changed. Refresh and try again.'}}});}
 if(path.endsWith('/versions')) return route.fulfill({json:{businessId:'business-a',assistantId:'a',versions:[draft]}});
 return route.fulfill({json:{businessId:'business-a',assistants:[assistant]}});
 });
 await page.goto(`${baseUrl}/assistants`);await page.getByRole('button',{name:/Test Assistant/}).click();
 await page.getByLabel('Assistant name').waitFor();
 await page.getByRole('button',{name:'Publish saved draft',exact:true}).click();assert.equal(publications,0);
 await page.getByRole('button',{name:'Publish version',exact:true}).click();
 await page.getByRole('dialog').getByText('Draft changed. Refresh and try again.',{exact:true}).waitFor();
 assert.equal(publications,1);
});
test('assistant load errors provide retry without a false empty directory',async(t)=>{
 const {page}=await fixture(t);let fail=true;
 await page.route('**/api/v1/businesses/business-a/assistants',route=>route.fulfill(fail?{status:503,json:{error:{code:'UNAVAILABLE',message:'Service unavailable'}}}:{json:{businessId:'business-a',assistants:[]}}));
 await page.goto(`${baseUrl}/assistants`);await page.getByText('Unable to load assistants',{exact:true}).waitFor();
 fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByText('No assistants yet.',{exact:false}).waitFor();
});
test('assistant workspace switch clears previous configurations',async(t)=>{
 const {page}=await fixture(t);
 await page.route('**/api/v1/businesses/business-a/assistants',route=>route.fulfill({json:{businessId:'business-a',assistants:[assistant]}}));
 await page.goto(`${baseUrl}/assistants`);await page.getByRole('button',{name:/Test Assistant/}).click();
 await page.getByLabel('Assistant name').waitFor();await page.locator('#workspace-switcher-select').selectOption('business-b');
 await page.getByText('No assistants yet.',{exact:false}).waitFor();assert.equal(await page.getByLabel('Assistant name').count(),0);
});
