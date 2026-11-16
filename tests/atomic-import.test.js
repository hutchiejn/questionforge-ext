import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseQuestions, splitAssessmentAndKey} from '../lib/parser.js';
import {buildExamPrompt,normalizePromptConfig} from '../lib/prompt-builder.js';
import {buildDocxBlob} from '../lib/docx-export.js';
import {DEFAULT_SETTINGS} from '../lib/model.js';

const fixture = new URL('./fixtures/atomic-structure-chatgpt-markdown.txt',import.meta.url);

test('actual ChatGPT formatted atomic-structure assessment imports 20, not 27',async()=>{
  const raw=await readFile(fixture,'utf8');
  const result=parseQuestions(raw);
  assert.equal(result.questions.length,20);
  assert.deepEqual(result.questions.reduce((out,q)=>(out[q.type]=(out[q.type]||0)+1,out),{}),
    {multiple_choice:10,identification:5,enumeration:3,essay:2});
  assert.deepEqual(result.warnings,[]);
  assert.deepEqual(result.questions.slice(0,10).map(q=>q.answer),
    ['A','B','B','C','C','C','C','B','C','C']);
  assert.deepEqual(result.questions.slice(10,15).map(q=>q.answer),
    ['Proton','Neutron','Electron cloud','15','22']);
  assert.deepEqual(result.questions.slice(15,18).map(q=>q.expectedCount),[3,2,3]);
  assert.deepEqual(result.questions[15].answer.split('\n'),['Proton','Neutron','Electron']);
  assert.equal(result.questions[16].answer.split('\n').length,2);
  assert.equal(result.questions[17].answer.split('\n').length,3);
  assert.ok(result.questions[18].answer.includes('overall charge of zero'));
  assert.ok(result.questions[19].answer.includes('electrons in the electron cloud'));
  assert.equal(result.questions[0].options.length,4);
  assert.ok(result.questions.every(q=>q.text && q.answer));
  assert.ok(result.questions.every(q=>!q.text.startsWith('Answer Key')));
  const blob=buildDocxBlob(result.questions,{...DEFAULT_SETTINGS,title:'Atomic Structure — Practice Assessment',includeAnswerKey:true});
  assert.ok((await blob.arrayBuffer()).byteLength>2000);
});

test('split answer-key headings in Markdown and Word-like plain text, not ordinary question text',()=>{
  const markdown='1. What is a proton?\nAnswer: Particle\n## **5. Answer Key**\nTeacher reference\n21. Something in key';
  assert.equal(splitAssessmentAndKey(markdown).assessment.includes('21.'),false);
  const plain='1. What is a proton?\nAnswer: Particle\n21. Answer Key Teacher reference\n22. A fake question from a table';
  const parsed=parseQuestions(plain);
  assert.equal(parsed.questions.length,1);
  assert.equal(parsed.questions[0].answer,'Particle');
});

test('missing answers are not invented when key is a broken copy',()=>{
  const raw='## Part I. Multiple Choice\n**1.** Which is correct?\nA. Good\nB. Bad\n## 5. Answer Key\n### Multiple Choice\nNo.\nCorrect answer\n';
  const result=parseQuestions(raw);
  assert.equal(result.questions.length,1);
  assert.equal(result.questions[0].answer,'');
});

test('generated plain-text prompt tells ChatGPT to keep answer beside question',()=>{
  const cfg=normalizePromptConfig({source:'topic',grade:'Grade 8',subject:'Science',topic:'Atomic structure',total:20,outputFormat:'text'});
  const prompt=buildExamPrompt(cfg);
  assert.match(prompt,/DO NOT append a separate Answer Key/);
  assert.match(prompt,/Answer: label/);
});
