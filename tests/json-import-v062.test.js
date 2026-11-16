import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuestions} from '../lib/parser.js';

function sample(){return {
  expected_total:4,
  type_counts:{multiple_choice:1,identification:1,enumeration:1,essay:1},
  questions:[
    {number:1,type:'multiple_choice',question:'What is the positive particle?',options:[{label:'A',text:'Proton'},{label:'B',text:'Neutron'},{label:'C',text:'Electron'},{label:'D',text:'Photon'}],answer:'A',explanation:'Positive charge',expectedCount:1,points:1},
    {number:2,type:'identification',question:'Name a negative particle.',options:[],answer:'Electron',explanation:'',expectedCount:1,points:1},
    {number:3,type:'enumeration',question:'List two atom particles.',options:[],answer:'Proton\nNeutron',explanation:'',expectedCount:2,points:2},
    {number:4,type:'essay',question:'Explain neutrality.',options:[],answer:'Proton and electron counts balance.',explanation:'',expectedCount:1,points:3},
  ]
};}
test('structured JSON with number/type metadata imports exactly and without warnings',()=>{
  const parsed=parseQuestions(JSON.stringify(sample()));
  assert.equal(parsed.questions.length,4);
  assert.deepEqual(parsed.warnings,[]);
  assert.equal(parsed.questions[2].answer,'Proton\nNeutron');
});
test('ChatGPT single json fenced block imports, instead of zero questions',()=>{
  const parsed=parseQuestions('```json\n'+JSON.stringify(sample(),null,2)+'\n```');
  assert.equal(parsed.questions.length,4);
  assert.deepEqual(parsed.warnings,[]);
});
test('unexpected extra questions and type drift produce explicit warnings',()=>{
  const data=sample();
  data.questions.push({...data.questions[1],number:5});
  data.questions[3].type='identification';
  const {questions,warnings}=parseQuestions(JSON.stringify(data));
  assert.equal(questions.length,5);
  assert.ok(warnings.some(x=>x.includes('Expected 4 questions')));
  assert.ok(warnings.some(x=>x.includes('Type count mismatch')));
});
test('duplicate or skipped numbering, invalid JSON, missing answers are visible problems',()=>{
  const data=sample(); data.questions[2].number=2;data.questions[3].answer='';
  const parsed=parseQuestions(JSON.stringify(data));
  assert.ok(parsed.warnings.some(x=>x.includes('Expected question number 3')));
  assert.ok(parsed.warnings.some(x=>x.includes('Missing correct answer')));
  const broken=parseQuestions('{"expected_total":4,"questions": [');
  assert.equal(broken.questions.length,0);
  assert.match(broken.warnings[0],/Invalid JSON/);
});
