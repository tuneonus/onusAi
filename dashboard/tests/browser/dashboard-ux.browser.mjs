import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, baseUrl } from './helpers/dashboardFixture.mjs';
const draft = {id:'v',assistantId:'a',businessId:'business-a',versionNumber:1,status:'draft',publishedAt:null,createdAt:'2026-11-27',updatedAt:'2026-11-27',displayName:'Support Assistant',description:null,systemInstructions:'Help customers.',language:'en',tone:'professional',welcomeMessage:'Hello',fallbackMessage:'Contact us',modelSettings:{temperature:0.2,maxOutputTokens:512,maxContextMessages:10},allowedTools:[],allowedKnowledgeScopes:['public'],knowledgeLocationScope:'business_wide',knowledgeLocationIds:[]};
const assistant={id:'a',businessId:'business-a',scope:'business',locationId:null,draftVersion:draft,publishedVersion:null};
async function editor(t) {
  const result=await fixture(t); const {page}=result;
  await page.route('**/api/v1/businesses/business-a/assistants**',route=>{
    const path=new URL(route.request().url()).pathname;
    const body=path.endsWith('/tools')?{tools:[]}:path.endsWith('/versions')?{businessId:'business-a',assistantId:path.split('/')[6],versions:[draft]}:{businessId:'business-a',assistants:[assistant,{...assistant,id:'b',draftVersion:{...draft,id:'vb',assistantId:'b',displayName:'Sales Assistant'}}]};
    return route.fulfill({json:body});
  });
  await page.goto(`${baseUrl}/assistants`);await page.getByRole('button',{name:/Support Assistant/}).click();
  return result;
}
test('tabs preserve edited fields, expose selection and support arrow-key navigation',async(t)=>{
  const {page}=await editor(t);
  await page.getByLabel('Assistant name').fill('Edited name');
  await page.getByRole('tab',{name:'Behavior',exact:true}).click();await page.getByLabel('System instructions').fill('Edited instructions');
  await page.getByRole('tab',{name:'Messages',exact:true}).click();await page.getByLabel('Welcome message').fill('Welcome back');
  await page.getByRole('tab',{name:'General',exact:true}).click();assert.equal(await page.getByLabel('Assistant name').inputValue(),'Edited name');
  await page.getByRole('tab',{name:'General',exact:true}).press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Behavior',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await page.getByLabel('System instructions').inputValue(),'Edited instructions');
  await page.getByRole('tab',{name:'Messages',exact:true}).click();assert.equal(await page.getByLabel('Welcome message').inputValue(),'Welcome back');
  assert.equal(await page.getByRole('button',{name:'Publish saved draft',exact:true}).isDisabled(),true);
});
test('assistant, route, workspace and sign-out navigation protect unsaved edits',async(t)=>{
  const {page}=await editor(t);await page.getByLabel('Assistant name').fill('Keep this');
  for(const action of [()=>page.getByRole('button',{name:/Sales Assistant/}).click(),()=>page.getByRole('link',{name:'Overview',exact:true}).click(),()=>page.locator('#workspace-switcher-select').selectOption('business-b'),()=>page.getByRole('button',{name:'Sign out',exact:true}).click()]){
    await action();await page.getByRole('dialog',{name:'Discard unsaved changes?'}).waitFor();
    await page.getByRole('button',{name:'Keep editing',exact:true}).click();assert.equal(await page.getByLabel('Assistant name').inputValue(),'Keep this');
  }
  assert.equal(await page.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),true);
  await page.getByRole('button',{name:/Sales Assistant/}).click();await page.getByRole('button',{name:'Discard changes',exact:true}).click();assert.equal(await page.getByLabel('Assistant name').inputValue(),'Sales Assistant');
});
test('validation opens the correct tab and focuses its invalid field',async(t)=>{
  const {page}=await editor(t);await page.getByRole('tab',{name:'Behavior',exact:true}).click();await page.getByLabel('System instructions').fill('');
  await page.getByRole('tab',{name:'General',exact:true}).click();await page.getByRole('button',{name:'Save Draft',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='assistant-instructions');assert.equal(await page.getByRole('tab',{name:'Behavior',exact:true}).getAttribute('aria-selected'),'true');
});
test('editor visuals, scrolling and navigation at desktop tablet mobile in both themes',async(t)=>{
  const {page}=await editor(t);
  for(const width of [1440,768,390])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:900});await page.getByRole('button',{name:`Use ${theme} theme`,exact:true}).click();
    for(const tab of ['General','Behavior','Messages','AI Settings','Knowledge','Tools','Versions']){await page.getByRole('tab',{name:tab,exact:true}).click();assert.equal(await page.getByRole('tabpanel').count(),1);}
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('tab',{name:'General',exact:true}).click();
    if(width>960){const before=await page.locator('.app-shell__sidebar').boundingBox();await page.locator('.app-shell__main').evaluate(e=>e.scrollTop=e.scrollHeight);const after=await page.locator('.app-shell__sidebar').boundingBox();assert.equal(after.y,before.y);assert.equal(after.height,before.height);}
    else {await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();await page.getByRole('link',{name:'Overview',exact:true}).waitFor({state:'visible'});await page.getByRole('button',{name:'Close navigation menu',exact:true}).click();}
    await page.screenshot({path:`/tmp/onussync-editor-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  }
});

test('chat keyboard submission, multiline text, metadata disclosure and action-menu focus',async(t)=>{
  const {playground}=await import('./helpers/conversationFixture.mjs');
  const {page,calls}=await playground(t);await page.goto(`${baseUrl}/conversations?workspace=business-a&conversation=c`);
  const composer=page.getByLabel('Message to assistant');await composer.fill('First line');await composer.press('Shift+Enter');await composer.pressSequentially('Second line');
  assert.equal(await composer.inputValue(),'First line\nSecond line');assert.equal(calls.filter(c=>c.path.endsWith('/turns')).length,0);
  await composer.press('Enter');await page.getByText('Mock response for browser verification',{exact:true}).waitFor();
  assert.equal(calls.filter(c=>c.path.endsWith('/turns')).length,1);
  const details=page.locator('.conversation-metadata');assert.equal(await details.getAttribute('open'),null);await page.getByText('Response details',{exact:true}).click();assert.notEqual(await details.getAttribute('open'),null);
  await page.getByRole('button',{name:'Conversation actions',exact:true}).click();await page.getByRole('menuitem',{name:'Delete',exact:true}).waitFor();
  await page.getByRole('menuitem',{name:'Delete',exact:true}).press('ArrowDown');assert.equal(await page.getByRole('menuitem',{name:'Purge permanently',exact:true}).evaluate(e=>document.activeElement===e),true);
  await page.getByRole('menuitem',{name:'Purge permanently',exact:true}).press('Escape');assert.equal(await page.getByRole('button',{name:'Conversation actions',exact:true}).evaluate(e=>document.activeElement===e),true);
  await page.getByRole('button',{name:'Conversation actions',exact:true}).click();await page.getByRole('menuitem',{name:'Delete',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
});
test('chat history scrolls independently; visual checks at six viewport/theme combinations',async(t)=>{
  const {playground,message}=await import('./helpers/conversationFixture.mjs');
  const {page}=await playground(t);
  await page.route('**/conversations/c/messages?**',route=>route.fulfill({json:{businessId:'business-a',conversationId:'c',messages:Array.from({length:40},(_,i)=>message(i%2?'assistant':'user',i+1,`Synthetic browser history message ${i+1}. This checks scroll containment.`)),pagination:{limit:100,offset:0,total:40,hasMore:false}}}));
  await page.goto(`${baseUrl}/conversations?workspace=business-a&conversation=c`);await page.getByLabel('Message to assistant').waitFor();
  for(const width of [1440,768,390])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:900});await page.getByRole('button',{name:`Use ${theme} theme`,exact:true}).click();
    const header=page.locator('.conversation-thread > header');const before=await header.boundingBox();
    await page.locator('.conversation-messages').evaluate(e=>e.scrollTop=e.scrollHeight);const after=await header.boundingBox();assert.equal(after.y,before.y);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`/tmp/onussync-chat-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  }
});

test('existing pages retain responsive presentation and accessible sidebar while content scrolls',async(t)=>{
  const {page}=await fixture(t);
  for(const path of ['/','/businesses','/locations','/staff','/diagnostics']){
    await page.goto(`${baseUrl}${path}`);await page.locator('.app-shell__main').waitFor();
    for(const width of [1440,768,390])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:900});await page.getByRole('button',{name:`Use ${theme} theme`,exact:true}).click();
      await page.locator('.app-shell__main').evaluate(e=>e.scrollTop=e.scrollHeight);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} fits at ${width}`);
      assert.equal((await page.locator('.app-shell__topbar').boundingBox()).y,0);
      if(width>960){assert.equal((await page.locator('.app-shell__sidebar').boundingBox()).y,0);}
      else {await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();await page.getByRole('link',{name:'Overview',exact:true}).waitFor();await page.getByRole('button',{name:'Close navigation menu',exact:true}).click();}
      await page.screenshot({path:`/tmp/onussync-${path.replaceAll('/','')||'overview'}-${width}-${theme}.png`,animations:'disabled'});
    }
  }
});
