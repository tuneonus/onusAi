import { fixture, baseUrl } from './dashboardFixture.mjs';
const config={id:'v',assistantId:'a',businessId:'business-a',versionNumber:1,status:'published',publishedAt:'2026-11-27',createdAt:'2026-11-27',updatedAt:'2026-11-27',displayName:'Playground Assistant',description:null,systemInstructions:'Help',language:'en',tone:'professional',welcomeMessage:'Hi',fallbackMessage:'Contact us',modelSettings:{temperature:0.2,maxOutputTokens:128,maxContextMessages:10},allowedTools:[],allowedKnowledgeScopes:['public'],knowledgeLocationScope:'business_wide',knowledgeLocationIds:[]};
const conversation={id:'c',businessId:'business-a',assistantId:'a',assistantVersionId:'v',channel:'playground',status:'active',locationId:null,messageCount:0,createdAt:'2026-11-27',updatedAt:'2026-11-27'};
const message=(role,sequenceNumber,content)=>({id:`msg-${sequenceNumber}`,businessId:'business-a',conversationId:'c',sequenceNumber,role,content,createdAt:'2026-11-27T10:00:00Z',metadata:role==='assistant'?{mode:'mock',model:'test-model',grounded:false}: {}});
async function playground(t,options={}) {
 const result=await fixture(t,options);const {page}=result;const calls=[];let messages=[];
 await page.route('**/api/v1/businesses/*/assistants**',route=>{
 const path=new URL(route.request().url()).pathname;
 return route.fulfill({json:path.endsWith('/versions')?{businessId:'business-a',assistantId:'a',versions:[config]}:{businessId:path.split('/')[4],assistants:path.split('/')[4] === 'business-a' ? [{id:'a',businessId:'business-a',scope:'business',locationId:null,draftVersion:null,publishedVersion:config}] : []}});
 });
 await page.route('**/api/v1/businesses/*/conversations**',async route=>{
 const path=new URL(route.request().url()).pathname;const businessId=path.split('/')[4];const method=route.request().method();
 calls.push({path,method,headers:route.request().headers(),body:route.request().postData()});
 if(path.endsWith('/turns')) {
  if(options.turnHandler)return options.turnHandler(route,calls);
  messages=[message('user',1,'Hello'),message('assistant',2,'Mock response for browser verification')];
  return route.fulfill({json:{businessId,conversationId:'c',assistantVersionId:'v',userMessage:messages[0],assistantMessage:messages[1],idempotentReplay:false,ai:{mode:'mock',model:'test-model',promptVersion:'respond-v1',grounded:false,status:'completed',requestId:'test-request',usage:{inputTokens:1,outputTokens:2,totalTokens:3,latencyMs:10}}}});
 }
 if(path.endsWith('/messages'))return route.fulfill({json:{businessId,conversationId:'c',messages,pagination:{limit:100,offset:0,total:messages.length,hasMore:false}}});
 if(path.endsWith('/c'))return route.fulfill({json:{businessId,conversation:method==='PATCH'?{...conversation,status:JSON.parse(route.request().postData()).status}:conversation}});
 return route.fulfill({json:method==='POST'?{businessId,conversation}:{businessId,conversations:businessId==='business-a'?[conversation]:[],pagination:{limit:20,offset:0,total:businessId==='business-a'?1:0,hasMore:false}}});
 });
 return {...result,calls};
}

export { playground, baseUrl, message, conversation };
