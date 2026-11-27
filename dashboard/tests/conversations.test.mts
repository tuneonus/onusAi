import assert from 'node:assert/strict';
import test from 'node:test';
import {ConversationApi,isConversation,isMessage} from '../src/features/conversations/api.ts';
import {logicalRequest,validateMessage,canStart} from '../src/features/conversations/validation.ts';
import {setCsrfToken} from '../src/services/api/client.ts';
import {emptyConfig,type Assistant} from '../src/features/assistants/types.ts';
const membership={businessId:'b',businessName:'Business',membershipId:'m',role:'owner' as const};
const conversation={id:'c',businessId:'b',assistantId:'a',assistantVersionId:'v',locationId:null,channel:'playground',status:'active',messageCount:0,createdAt:'2026-11-27',updatedAt:'2026-11-27'};
const message={id:'msg',businessId:'b',conversationId:'c',sequenceNumber:1,role:'user',content:'Hello',metadata:{},createdAt:'2026-11-27'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('conversation and message contracts reject wrong tenant, status, role and thread',()=>{
 assert.equal(isConversation(conversation,'b'),true);assert.equal(isConversation({...conversation,businessId:'foreign'},'b'),false);
 assert.equal(isConversation({...conversation,status:'deleted'},'b'),false);
 assert.equal(isMessage(message,'b','c'),true);assert.equal(isMessage({...message,conversationId:'other'},'b','c'),false);
 assert.equal(isMessage({...message,role:'admin'},'b','c'),false);
});
test('message validation respects the actual 4000 character turn limit',()=>{assert.ok(validateMessage('  '));assert.ok(validateMessage('a'.repeat(4001)));assert.equal(validateMessage('Hello'),null);});
test('logical requests reuse retry keys but allocate new keys for changed text',()=>{const a=logicalRequest(null,'Hello');assert.equal(logicalRequest(a,'Hello'),a);assert.notEqual(logicalRequest(a,'Changed').key,a.key);});
test('playground selection requires published assistants and matching active locations',()=>{
 const a={id:'a',businessId:'b',scope:'business',locationId:null,draftVersion:null,publishedVersion:{...emptyConfig(),id:'v',assistantId:'a',businessId:'b',versionNumber:1,status:'published',publishedAt:null,createdAt:'',updatedAt:''}} as Assistant;
 assert.equal(canStart(a,null,[]),true);assert.equal(canStart({...a,publishedVersion:null},null,[]),false);assert.equal(canStart({...a,locationId:'l'},null,[]),false);assert.equal(canStart(a,'foreign',[]),false);
});
test('conversation creation scopes requests, preserves stable idempotency keys and CSRF',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;setCsrfToken(null);});setCsrfToken('csrf-test');let requests=0;
 globalThis.fetch=async(input,init)=>{requests++;assert.ok(String(input).endsWith('/businesses/b/conversations'));assert.equal(init?.method,'POST');assert.equal(init?.credentials,'include');assert.equal(new Headers(init?.headers).get('Idempotency-Key'),'stable');assert.equal(new Headers(init?.headers).get('X-CSRF-Token'),'csrf-test');return json({businessId:'b',conversation});};
 const api=new ConversationApi(membership,new AbortController().signal);await api.create('a',null,'stable');await api.create('a',null,'stable');assert.equal(requests,2);
});
test('conversation history follows pagination and sorts chronological sequence',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async input=>json({businessId:'b',conversationId:'c',messages:[{...message,sequenceNumber:String(input).includes('offset=0')?1:2}],pagination:{limit:100,offset:0,total:2,hasMore:String(input).includes('offset=0')}});
 const result=await new ConversationApi(membership,new AbortController().signal).messages('c');assert.deepEqual(result.map(m=>m.sequenceNumber),[1,2]);
});
test('operator delete and purge are prevented without network requests',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;globalThis.fetch=async()=>{calls++;return json({});};const api=new ConversationApi({...membership,role:'operator'},new AbortController().signal);
 await assert.rejects(()=>api.remove('c',false),{status:403});await assert.rejects(()=>api.remove('c',true),{status:403});assert.equal(calls,0);
});
test('all backend conversation statuses use PATCH and validate returned identity',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;});const api=new ConversationApi(membership,new AbortController().signal);
 for(const status of ['active','pending_human','human_active','closed'] as const){globalThis.fetch=async(_input,init)=>{assert.equal(init?.method,'PATCH');assert.equal(JSON.parse(String(init.body)).status,status);return json({businessId:'b',conversation:{...conversation,status}});};assert.equal((await api.status('c',status)).status,status);}
});
test('late responses after cancellation and foreign tenant payloads are rejected',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;});const pending=Promise.withResolvers<Response>();globalThis.fetch=()=>pending.promise;const controller=new AbortController();const api=new ConversationApi(membership,controller.signal);const request=api.list();controller.abort();pending.resolve(json({businessId:'b',conversations:[]}));await assert.rejects(()=>request,{name:'AbortError'});
 globalThis.fetch=async()=>json({businessId:'foreign',conversation});await assert.rejects(()=>new ConversationApi(membership,new AbortController().signal).conversation('c'),{code:'INVALID_CONVERSATION_RESPONSE'});
});
test('turn errors preserve server timeout, rate-limit and service failure details',async(t)=>{
 const original=fetch;t.after(()=>{globalThis.fetch=original;});const api=new ConversationApi(membership,new AbortController().signal);
 for(const status of [401,403,409,429,503,504]){globalThis.fetch=async()=>json({error:{code:'TURN_FAILED',message:'Try again'}},status);await assert.rejects(()=>api.turn('c','Hello','stable'),{status});}
});
