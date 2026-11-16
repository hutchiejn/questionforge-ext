import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PROMPT_CONFIG, normalizePromptConfig, allocateTypes, validatePromptConfig, buildCoveragePrompt, buildExamPrompt, buildRepairPrompt} from '../lib/prompt-builder.js';

const sample=()=>normalizePromptConfig(DEFAULT_PROMPT_CONFIG);
test('automatic per-type allocation adds exactly to total and respects selected types',()=>{
  for(const total of [4,12,30,40,100,200]){
    const c={...sample(),total};
    const a=allocateTypes(c);
    assert.equal(Object.values(a).reduce((x,y)=>x+y,0),total);
    assert.ok(c.selectedTypes.every(t=>a[t]>=1));
    assert.equal(a.true_false,0);
  }
  assert.deepEqual(validatePromptConfig({...sample(),total:2}).some(e=>e.includes('at least')),true);
});
test('custom allocations for types and topics must total question count exactly',()=>{
  const c={...sample(),total:30,allocationMode:'custom',customCounts:{multiple_choice:15,identification:8,enumeration:5,essay:2,true_false:0},topicMode:'custom',topics:[{name:'Volcanoes',count:12},{name:'Earthquakes',count:18}]};
  assert.deepEqual(validatePromptConfig(c),[]);
  assert.match(buildCoveragePrompt(c),/Volcanoes: 12/);
  assert.match(buildExamPrompt(c),/\"multiple_choice\":15/);
  assert.match(buildExamPrompt(c),/\"identification\":8/);
  assert.ok(validatePromptConfig({...c,topics:[{name:'Volcanoes',count:10},{name:'Earthquakes',count:18}]}).some(e=>e.includes('Topic counts')));
  assert.ok(validatePromptConfig({...c,customCounts:{...c.customCounts,essay:1}}).some(e=>e.includes('Question-type counts')));
});
test('BOW lesson plan stage 1 asks for the real files and stops before generating questions',()=>{
  const s=buildCoveragePrompt(sample());
  assert.match(s,/attach both the BOW and lesson plan/);
  assert.match(s,/DO NOT GENERATE ANY QUESTIONS YET/);
  assert.match(s,/Do you approve this coverage plan/);
  assert.match(s,/teaching hours/);
  assert.doesNotMatch(s,/A\. Plausible choice/);
});
test('topic-only prompt does not demand an attachment while TOS prioritizes teacher allocation',()=>{
  const topic={...sample(),source:'topic',topic:'Volcanoes'};
  assert.deepEqual(validatePromptConfig(topic),[]);
  assert.match(buildCoveragePrompt(topic),/Do not require an attachment/);
  assert.ok(validatePromptConfig({...topic,topic:''}).length>0);
  const tos=buildCoveragePrompt({...sample(),source:'tos'});
  assert.match(tos,/Prioritize the supplied TOS/);
});
test('stage 2 asks for approved plan in same conversation and plain-text parser format',()=>{
  const exam=buildExamPrompt({...sample(),outputFormat:'text'});
  assert.match(exam,/Use the APPROVED coverage plan/);
  assert.match(exam,/THIS SAME ChatGPT conversation/);
  assert.match(exam,/Number EVERY question sequentially/);
  assert.match(exam,/Answer: B/);
  assert.match(exam,/List three relevant items/);
  assert.match(exam,/no code fences/);
});
test('advanced structured JSON format matches the deterministic parser schema',()=>{
  const exam=buildExamPrompt({...sample(),outputFormat:'json'});
  assert.match(exam,/STRICT, IMPORT-READY JSON/);
  assert.match(exam,/"questions": \[/);
  assert.match(exam,/"multiple_choice"/);
  assert.match(exam,/"expectedCount"/);
  assert.match(exam,/JSON\.parse/);
  assert.doesNotMatch(exam,/MULTIPLE CHOICE\n1\./);
});
test('malformed saved prompt settings have safe defaults and validation catches errors',()=>{
  const c=normalizePromptConfig({source:'nonexistent',selectedTypes:['fake','essay','essay'],cognitiveLevels:['bad'],outputFormat:'unrecognized'});
  assert.equal(c.source,'bow_lesson');
  assert.deepEqual(c.selectedTypes,['essay']);
  assert.equal(c.outputFormat,'json');
  assert.ok(validatePromptConfig(c).some(s=>s.includes('learning objective')));
  assert.throws(()=>buildCoveragePrompt(c),/learning objective/);
});

test('structured JSON is the default and carries expected count and type breakdown',()=>{
  const c={...sample(),source:'topic',topic:'Atomic structure',total:20};
  assert.equal(c.outputFormat,'json');
  const prompt=buildExamPrompt(c);
  assert.match(prompt,/"expected_total": 20/);
  assert.match(prompt,/"type_counts": {"multiple_choice":10,"identification":5,"enumeration":3,"essay":2}/);
  assert.match(prompt,/without gaps or duplicates/);
  assert.match(prompt,/Never append a second "Answer Key"/);
  assert.match(prompt,/JSON.parse\(\)/);
});
test('repair prompt requests preservation of original assessment with exact type counts',()=>{
  const c={...sample(),source:'topic',topic:'Atomic structure',total:20};
  const prompt=buildRepairPrompt(c);
  assert.match(prompt,/FORMAT REPAIR/);
  assert.match(prompt,/exactly 20 REAL questions/);
  assert.match(prompt,/Do not treat headings, directions, answer-key table rows/);
  assert.match(prompt,/no gaps or duplicates/);
  assert.match(prompt,/THIS conversation/);
});
