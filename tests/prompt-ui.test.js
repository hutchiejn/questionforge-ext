import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('prompt tab is integrated with import, review and export',()=>{
  assert.match(app,/\['prompt','00','Prompt'\]/);
  assert.match(app,/Build your exam prompt/);
  assert.match(app,/Copy coverage prompt/);
  assert.match(app,/Copy exam prompt/);
  assert.match(app,/Fix an existing AI exam/);
  assert.match(app,/data-action="copyRepair"/);
  assert.match(app,/data-tab="prompt"/);
});
test('prompt builder offers all requested source materials, question type splits, topic counts and learning skills',()=>{
  assert.match(app,/data-prompt-count/);
  assert.match(app,/data-topic-field/);
  assert.match(app,/Learning objectives/);
  assert.match(app,/Plain text \(less reliable\)/);
  assert.match(app,/Structured JSON \(recommended\)/);
  assert.match(css,/\.prompt-preview pre/);
});

test('legacy attachment drafts restore and copy neutral prompts through approval and repair',async()=>{
  const handlers={},copied=[];
  const root={innerHTML:'',addEventListener(type,handler){handlers[type]=handler;}};
  const toast={innerHTML:''},approval={checked:false};
  const originals=Object.fromEntries(['document','localStorage','navigator','setTimeout'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const globals={
    document:{querySelector(selector){return selector==='#app'?root:selector==='#toast-host'?toast:selector==='#plan-approved'?approval:null;}},
    localStorage:{getItem(){return JSON.stringify({questionforgeDraft:{sourceMode:'chatgpt',promptConfig:{language:'Hiligaynon (Iloilo)'}},questionforgePrivacy:{shareWarning:false}});}},
    navigator:{clipboard:{async writeText(text){copied.push(text);}}},
    setTimeout:()=>0,
  };
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const click=dataset=>handlers.click({target:{closest(){return {dataset};}}});
  try{
    await import('../app.js');
    await settle();
    click({tab:'prompt'});
    for(const provider of ['ChatGPT','Gemini','DeepSeek','Claude','Perplexity','Grok'])assert.ok(root.innerHTML.includes(provider));
    assert.match(root.innerHTML,/value="attachment" checked/);
    assert.match(root.innerHTML,/If uploads are unavailable/);
    assert.match(root.innerHTML,/If you switch chatbots or start a new chat/);
    assert.match(root.innerHTML,/label for="prompt-language">Exam language \/ dialect/);
    assert.match(root.innerHTML,/data-prompt-field="language" list="prompt-languages"/);
    assert.match(root.innerHTML,/value="Hiligaynon \(Iloilo\)"/);
    handlers.input({target:{dataset:{promptField:'language'},value:'Tagalog (Batangas)'}});
    click({action:'copyExam'});
    await settle();
    assert.equal(copied.length,0);
    assert.match(toast.innerHTML,/Approve the coverage plan in your chatbot first/);
    click({action:'copyCoverage'});
    await settle();
    assert.equal(copied.length,1);
    assert.match(copied[0],/COVERAGE PLANNING ONLY/);
    assert.match(copied[0],/paste its verified text if file uploads are unavailable/);
    handlers.change({target:{id:'plan-approved',checked:true}});
    assert.equal(approval.checked,true);
    click({action:'copyExam'});
    await settle();
    assert.equal(copied.length,2);
    assert.match(copied[1],/STRICT, IMPORT-READY JSON/);
    for(const prompt of copied)assert.match(prompt,/Exam language \/ dialect: Tagalog \(Batangas\)/);
    handlers.input({target:{dataset:{promptField:'language'},value:'Cebuano (Bisaya)'}});
    assert.equal(approval.checked,false);
    click({action:'copyExam'});
    await settle();
    assert.equal(copied.length,2);
    assert.match(toast.innerHTML,/Approve the coverage plan in your chatbot first/);
    click({action:'copyRepair'});
    await settle();
    assert.equal(copied.length,3);
    assert.match(copied[2],/FORMAT REPAIR/);
    assert.match(copied[2],/Exam language \/ dialect: Cebuano \(Bisaya\)/);
    for(const prompt of copied)assert.doesNotMatch(prompt,/ChatGPT|Gemini|DeepSeek|Claude|Perplexity|Grok/i);
  }finally{
    for(const [key,descriptor] of Object.entries(originals)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});
