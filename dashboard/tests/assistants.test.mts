import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantRequest, isVersion } from '../src/features/assistants/api.ts';
import { emptyConfig, configFromVersion } from '../src/features/assistants/types.ts';
import { validateConfig } from '../src/features/assistants/validation.ts';
import { setCsrfToken } from '../src/services/api/client.ts';
const membership = { businessId:'b',membershipId:'m',businessName:'Business',role:'owner' as const };
const config = {...emptyConfig(),displayName:'Helper',systemInstructions:'Help customers.',welcomeMessage:'Hello',fallbackMessage:'Please contact us.'};
const version = {...config,id:'v',assistantId:'a',businessId:'b',versionNumber:1,status:'draft',createdAt:'2026-11-27',updatedAt:'2026-11-27',publishedAt:null};
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('assistant defaults and configuration limits match the backend',()=>{
 assert.deepEqual(config.modelSettings,{temperature:0.2,maxOutputTokens:512,maxContextMessages:10});
 assert.deepEqual(validateConfig(config,null,[],[]),[]);
 for(const modelSettings of [{...config.modelSettings,temperature:2},{...config.modelSettings,maxOutputTokens:63},{...config.modelSettings,maxContextMessages:1.5}]) assert.ok(validateConfig({...config,modelSettings},null,[],[]).length);
 assert.ok(validateConfig({...config,displayName:'',language:'invalid_language'},null,[],[]).length);
});
test('assistant scope validation rejects foreign, archived and incompatible location selections',()=>{
 assert.ok(validateConfig({...config,knowledgeLocationScope:'assigned_location'},null,[],[]).length);
 assert.deepEqual(validateConfig({...config,knowledgeLocationScope:'assigned_location'},'l',['l'],[]),[]);
 assert.ok(validateConfig({...config,knowledgeLocationScope:'selected_locations',knowledgeLocationIds:['foreign']},null,['l'],[]).length);
 assert.deepEqual(validateConfig({...config,knowledgeLocationScope:'selected_locations',knowledgeLocationIds:['l']},null,['l'],[]),[]);
 assert.ok(validateConfig(config,'archived',[],[]).length);
});
test('assistant tool permissions are limited to the server registry',()=>{
 assert.ok(validateConfig({...config,allowedTools:['arbitrary']},null,[],['approved']).length);
 assert.deepEqual(validateConfig({...config,allowedTools:['approved']},null,[],['approved']),[]);
});
test('assistant version contract rejects wrong tenants, assistant IDs, status and malformed model settings',()=>{
 assert.equal(isVersion(version,'b','a'),true);
 for(const bad of [{...version,businessId:'foreign'},{...version,assistantId:'foreign'},{...version,status:'live'},{...version,modelSettings:null}]) assert.equal(isVersion(bad,'b','a'),false);
 assert.deepEqual(Object.keys(configFromVersion(config)).sort(),Object.keys(config).sort());
});
test('operator assistant writes are blocked before any network request',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
 globalThis.fetch=async()=>{calls++;return json({});};
 for(const action of ['create','draft','update','publish'] as const) await assert.rejects(()=>assistantRequest({...membership,role:'operator'},new AbortController().signal,action,'a','v'),{status:403});
 assert.equal(calls,0);
});
test('assistant draft creation, update and publishing use scoped routes, methods and CSRF',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;setCsrfToken(null);});setCsrfToken('test-csrf');
 const calls:Array<{url:string;init?:RequestInit}>=[];
 globalThis.fetch=async(input,init)=>{calls.push({url:String(input),init});return json({businessId:'b',assistantId:'a',version});};
 const signal=new AbortController().signal;
 await assistantRequest(membership,signal,'create',undefined,undefined,{...config,locationId:null});
 await assistantRequest(membership,signal,'draft','a');
 await assistantRequest(membership,signal,'update','a','v',config);
 await assistantRequest(membership,signal,'publish','a','v');
 assert.deepEqual(calls.map(c=>c.init?.method),['POST','POST','PATCH','POST']);
 assert.ok(calls[1].url.endsWith('/businesses/b/assistants/a/versions'));
 assert.ok(calls[3].url.endsWith('/versions/v/publish'));
 assert.equal(calls[3].init?.body,'{}');
 assert.ok(calls.every(c=>new Headers(c.init?.headers).get('X-CSRF-Token')==='test-csrf' && c.init?.credentials==='include' && c.init.signal===signal));
});
test('assistant list accepts business/location scopes and rejects cross-tenant versions',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;});
 const assistant={id:'a',businessId:'b',scope:'business',locationId:null,draftVersion:version,publishedVersion:null};
 globalThis.fetch=async()=>json({businessId:'b',assistants:[assistant]});
 assert.ok('assistants' in await assistantRequest(membership,new AbortController().signal,'list'));
 globalThis.fetch=async()=>json({businessId:'b',assistants:[{...assistant,scope:'location',locationId:'l'}]});
 await assistantRequest(membership,new AbortController().signal,'list');
 globalThis.fetch=async()=>json({businessId:'b',assistants:[{...assistant,draftVersion:{...version,businessId:'foreign'}}]});
 await assert.rejects(()=>assistantRequest(membership,new AbortController().signal,'list'),{code:'INVALID_ASSISTANT_RESPONSE'});
});
test('assistant cancellation rejects late responses even when transport ignores abort',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;});const pending=Promise.withResolvers<Response>();
 globalThis.fetch=()=>pending.promise;const controller=new AbortController();
 const request=assistantRequest(membership,controller.signal,'list');controller.abort();pending.resolve(json({businessId:'b',assistants:[]}));
 await assert.rejects(()=>request,{name:'AbortError'});
});
test('assistant publishing conflicts and forbidden responses remain errors',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;});
 for(const status of [403,409,503]) {globalThis.fetch=async()=>json({error:{code:'PUBLISH_FAILED',message:'Cannot publish.'}},status);
 await assert.rejects(()=>assistantRequest(membership,new AbortController().signal,'publish','a','v'),{status});}
});
