import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseQuestions} from '../lib/parser.js';
import {createDemoQuestions, DEFAULT_SETTINGS, validateQuestion} from '../lib/model.js';
import {buildDocxBlob} from '../lib/docx-export.js';
import {renderPaper} from '../lib/print-export.js';

const mockText=`MULTIPLE CHOICE
1. What does HTML stand for?
A. Hyper Text Markup Language
B. High Text Machine Language
C. Hyperlinks Tool Markup Language
D. Home Tool Markup Language
Answer: A
Explanation: HTML describes page structure.

IDENTIFICATION
2. What language does Django use?
Answer: Python

ENUMERATION
3. List 3 web technologies.
Answer:
- HTML
- CSS
- JS

ESSAY
4. Explain the importance of software testing.
Answer: Prevents defects.`;
test('parses mixed question types and explicit answers',()=>{
  const {questions,warnings}=parseQuestions(mockText);
  assert.equal(questions.length,4);
  assert.deepEqual(questions.map(q=>q.type),['multiple_choice','identification','enumeration','essay']);
  assert.equal(questions[0].options.length,4);
  assert.equal(questions[0].answer,'A');
  assert.equal(questions[0].explanation,'HTML describes page structure.');
  assert.equal(questions[1].answer,'Python');
  assert.equal(questions[2].expectedCount,3);
  assert.ok(questions[2].answer.includes('CSS'));
  assert.deepEqual(warnings,[]);
});
test('parses formatted JSON inputs',()=>{
  const {questions}=parseQuestions(JSON.stringify([{type:'multiple_choice',question:'One?',options:['Yes','No'],answer:'A'}]));
  assert.equal(questions[0].text,'One?');assert.equal(questions[0].options[1].label,'B');
});
test('never hallucinates missing answers',()=>{
  const {questions}=parseQuestions('1. What is a CPU?\nA. Choice 1\nB. Choice 2');
  assert.equal(questions.length,1);
  assert.equal(questions[0].answer,'');
});
test('validates missing choices and mismatched answer',()=>{
  const q=createDemoQuestions()[0];q.options=[{label:'A',text:'Only'}];q.answer='B';
  assert.equal(validateQuestion(q).length,2);
});
test('creates a docx archive with a real ZIP header and OOXML parts',async()=>{
  const questions=createDemoQuestions();
  const blob=buildDocxBlob(questions,{...DEFAULT_SETTINGS,mode:'teacher',school:'Demo School',showPoints:true});
  assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const data=Buffer.from(await blob.arrayBuffer());
  assert.equal(data.toString('ascii',0,2),'PK');
  assert.ok(data.includes(Buffer.from('word/document.xml')));
  assert.ok(data.includes(Buffer.from('ANSWER KEY')));
  const dir=await mkdtemp(join(tmpdir(),'questionforge-'));
  await writeFile(join(dir,'test.docx'),data);
});
test('escapes untrusted HTML in preview',()=>{
  const qs=createDemoQuestions();qs[0].text='<script>danger</script>';
  const preview=renderPaper(qs,DEFAULT_SETTINGS,{preview:true});
  assert.ok(preview.markup.includes('&lt;script&gt;'));
  assert.ok(!preview.markup.includes('<script>'));
});

test('imports all 30 real-world volcano questions even when copied as one long paragraph',async()=>{
  const {readFile} = await import('node:fs/promises');
  const raw=await readFile(new URL('./fixtures/volcanoes-one-line.txt',import.meta.url),'utf8');
  const {questions,warnings}=parseQuestions(raw);
  assert.equal(questions.length,30);
  assert.deepEqual(warnings,[]);
  const counts=questions.reduce((acc,q)=>(acc[q.type]=(acc[q.type]||0)+1,acc),{});
  assert.deepEqual(counts,{multiple_choice:10, identification:8, enumeration:7, essay:5});
  assert.ok(questions.slice(0,10).every(q=>q.options.length===4));
  assert.equal(questions[0].options[1].text,"An opening in Earth's crust through which magma, gases, and ash escape");
  assert.equal(questions[0].answer,'B');
  assert.ok(questions[0].explanation.startsWith('A volcano is an opening'));
  assert.equal(questions[12].answer,'Conduit or volcanic vent');
  assert.equal(questions[18].expectedCount,3);
  assert.deepEqual(questions[18].answer.split('\n'),['Shield volcano','Composite volcano','Cinder cone volcano']);
  assert.deepEqual(questions[24].answer.split('\n'),['Fertile soil for agriculture','Geothermal energy','Formation of new land and mineral resources']);
  assert.ok(questions[29].answer.includes('help communities recover after an eruption'));
  assert.ok(questions.every(q=>q.text.length>15 && q.answer.trim()));
});

test('parses inline headings, choices, answers and explanations without adding answers',()=>{
  const raw='SAMPLE QUIZ MULTIPLE CHOICE 1. Which is a valid number? A. 3.14 B. Seven C. None D. All Answer: A Explanation: 3.14 is a number. IDENTIFICATION 2. Name the shape. Answer: Triangle';
  const {questions,warnings}=parseQuestions(raw);
  assert.equal(questions.length,2);
  assert.deepEqual(warnings,[]);
  assert.deepEqual(questions.map(q=>q.type),['multiple_choice','identification']);
  assert.equal(questions[0].options[0].text,'3.14');
  assert.equal(questions[0].explanation,'3.14 is a number.');
  assert.equal(questions[1].answer,'Triangle');
});

test('enumeration supports written counts and one-line double-spaced answers',()=>{
  const raw='ENUMERATION 1. Name three languages. Answer:  Python  JavaScript  Java  2. List 2 colors. Answer:  Blue  Red';
  const {questions,warnings}=parseQuestions(raw);
  assert.equal(questions.length,2);
  assert.deepEqual(warnings,[]);
  assert.deepEqual(questions.map(q=>q.expectedCount),[3,2]);
  assert.equal(questions[0].answer,'Python\nJavaScript\nJava');
});
