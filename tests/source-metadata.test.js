import test from 'node:test';
import assert from 'node:assert/strict';
import {detectSourceMetadata} from '../lib/source-metadata.js';

const doc=(name,blocks,kind='docx')=>({name,kind,sourceId:name,blocks});
const para=(text,ref='Paragraph 1')=>({kind:'paragraph',ref,text,selected:true});
const cell=(text,ref)=>({text,ref,column:ref.replace(/[0-9]/g,'')});
const row=(texts,ref='Table 1 · row 1')=>({kind:'table-row',ref,tableId:'Table 1',cells:texts.map((t,i)=>cell(t,`${String.fromCharCode(65+i)}1`)),selected:true});

test('auto-detects explicit Grade 11 and General Chemistry from lesson plan headings',()=>{
 const d=doc('Lesson plan.docx',[para('School: Miguel L. Daclan National High School\nGrade Level: 11\nSubject: General Chemistry\nQuarter: 2')]);
 const f=detectSourceMetadata([d]).fields;
 assert.equal(f.grade.value,'Grade 11');assert.equal(f.grade.status,'detected');
 assert.equal(f.subject.value,'General Chemistry');assert.equal(f.quarter.value,'Quarter 2');
 assert.equal(f.school.value,'Miguel L. Daclan National High School');
 assert.match(f.subject.evidence.ref,/Paragraph 1/);
});
test('extracts subject and grade from multiple TOS table rows, preserving cell references',()=>{
 const d=doc('TOS.xlsx',[row(['GRADE LEVEL','11'],'Sheet 1 · row 2'),row(['SUBJECT','General Chemistry 1'],'Sheet 1 · row 3'),row(['QUARTER','1st Quarter'],'Sheet 1 · row 4')],'xlsx');
 const f=detectSourceMetadata([d]).fields;
 assert.equal(f.grade.value,'Grade 11');assert.equal(f.subject.value,'General Chemistry 1');
 assert.equal(f.quarter.value,'Quarter 1');assert.match(f.subject.evidence.ref,/B1/);
});
test('reads a clear heading without pretending the STEM strand is the subject or grade',()=>{
 const d=doc('curriculum.pdf',[
   {kind:'pdf-page',ref:'Page 1',page:1,text:'K TO 12 SENIOR HIGH SCHOOL\nSCIENCE, TECHNOLOGY, ENGINEERING AND MATHEMATICS (STEM)\nGENERAL CHEMISTRY 1 AND 2\nSPECIALIZED SUBJECT',selected:true},
   {kind:'pdf-page',ref:'Page 2',page:2,text:'Students analyze chemical reactions and atomic structure',selected:true}
 ],'pdf');
 const f=detectSourceMetadata([d]).fields;
 assert.equal(f.grade.status,'missing');
 assert.equal(f.subject.status,'detected');
 assert.match(f.subject.value,/General Chemistry 1 and 2/i);
});
test('different grades across BOW and LP flag conflict rather than selecting one',()=>{
 const f=detectSourceMetadata([
  doc('bow.docx',[para('Grade Level: 8\nSubject: Science')]),
  doc('lesson.docx',[para('Grade Level: 9\nSubject: Science')]),
 ]).fields;
 assert.equal(f.grade.status,'conflict');assert.equal(f.grade.value,'');
 assert.equal(f.subject.status,'detected');
});
test('filename only is a hint, never auto-filled',()=>{
 const f=detectSourceMetadata([doc('Grade_8_Science_BOW.xlsx',[row(['Topic','Hours','Competency'])],'xlsx')]).fields;
 assert.equal(f.grade.status,'hint');assert.equal(f.subject.status,'hint');
});
test('general classroom prose and K to 12 do not create invented metadata',()=>{
 const f=detectSourceMetadata([doc('lesson.pdf',[para('The students in Grade 8 discuss Science in everyday life.\nK to 12 curriculum includes Senior High School.')])]).fields;
 assert.equal(f.grade.status,'missing');assert.equal(f.subject.status,'missing');
});
test('selected false blocks are not used',()=>{
 const f=detectSourceMetadata([doc('mixed.txt',[{...para('Grade Level: 5'),selected:false},para('Subject: Biology','Paragraph 2')])]).fields;
 assert.equal(f.grade.status,'missing');assert.equal(f.subject.value,'Biology');
});
test('labeled grade is preferred over filename containing a different number',()=>{
 const f=detectSourceMetadata([doc('Grade_8_BOW.docx',[para('Grade Level: 11')])]).fields;
 assert.equal(f.grade.status,'detected');assert.equal(f.grade.value,'Grade 11');
});
test('multiple strong subject matches remain conflicts pending teacher review',()=>{
 const f=detectSourceMetadata([doc('multisubject.docx',[para('Subject: Mathematics'),para('Learning Area: Science','Paragraph 2')])]).fields;
 assert.equal(f.subject.status,'conflict');
});
test('detects grade and subject in an actual Grade 8 Science-style lesson heading',()=>{
 const f=detectSourceMetadata([doc('lesson-plan.docx',[para('Grade 8 Science — Atomic Structure')])]).fields;
 assert.equal(f.grade.value,'Grade 8');assert.equal(f.subject.value,'Science');
});
test('supports Grade & Section and Subject / Learning Area fields',()=>{
 const f=detectSourceMetadata([doc('LP.docx',[para('Grade & Section: Grade 11 - STEM\nSubject / Learning Area: General Chemistry 1')])]).fields;
 assert.equal(f.grade.value,'Grade 11');
 assert.equal(f.subject.value,'General Chemistry 1');
});
test('short Grade 11 General Chemistry headings can fill both fields',()=>{
 const f=detectSourceMetadata([doc('teaching-material.pdf',[{kind:'pdf-page',page:1,ref:'Page 1',text:'GRADE 11 — GENERAL CHEMISTRY',selected:true}],'pdf')]).fields;
 assert.equal(f.grade.value,'Grade 11');assert.equal(f.subject.value.toLowerCase(),'general chemistry');
});
