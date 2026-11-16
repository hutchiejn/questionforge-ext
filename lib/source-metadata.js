/**
 * Conservative, deterministic metadata suggestions from teacher-provided documents.
 * Not AI, not content verification. Only explicit headers, table labels and short
 * document titles qualify. Ambiguous or filename-only matches require review.
 */
export const METADATA_FIELDS = ['grade','subject','quarter','school'];
const CLEAN_SPACE = /[\u00a0\u2000-\u200b\s]+/g;
const squeeze = text => String(text ?? '').replace(CLEAN_SPACE,' ').trim();
const tidyValue = text => squeeze(text).replace(/^[\s:–—-]+|[|;,.\s]+$/g,'').slice(0,160);
const normal = text => squeeze(text).toLowerCase().replace(/[.\-]+/g,' ').replace(/\s+/g,' ');
const yearNumber = '(?:[1-9]|1[0-2])';

const LABELS = [
  ['grade',/^(?:grade(?:\s*\/\s*year)?\s*level|grade(?:\s*(?:&|and)\s*section)?|year\s*level|baitang)\b\s*(?:[:=–—-]\s*|\s+)(.{1,100})$/i],
  ['subject',/^(?:subject\s*\/\s*learning\s*area|subject(?:\s*name)?|learning\s*area|course(?:\s*title)?|asignatura)\b\s*(?:[:=–—-]\s*|\s+)(.{1,130})$/i],
  ['quarter',/^(?:quarter|grading\s*period|assessment\s*period|term)\b\s*(?:[:=–—-]\s*|\s+)(.{1,80})$/i],
  ['school',/^(?:school(?:\s*\/\s*institution|\s*name)?|institution(?:\s*name)?)\b\s*(?:[:=–—-]\s*|\s+)(.{1,150})$/i],
];
const LABEL_CELL = [
  ['grade',/^(?:grade(?:\s*\/\s*year)?\s*level|grade(?:\s*(?:&|and)\s*section)?|year\s*level|baitang)\s*:?$/i],
  ['subject',/^(?:subject\s*\/\s*learning\s*area|subject(?:\s*name)?|learning\s*area|course(?:\s*title)?|asignatura)\s*:?$/i],
  ['quarter',/^(?:quarter|grading\s*period|assessment\s*period|term)\s*:?$/i],
  ['school',/^(?:school(?:\s*\/\s*institution|\s*name)?|institution(?:\s*name)?)\s*:?$/i],
];
const SUBJECT_TITLES = [
  'General Chemistry(?:\\s*(?:1|2|I|II)(?:\\s*(?:and|&)\\s*(?:2|II))?)?',
  'General Physics(?:\\s*(?:1|2|I|II)(?:\\s*(?:and|&)\\s*(?:2|II))?)?',
  'General Biology(?:\\s*(?:1|2|I|II)(?:\\s*(?:and|&)\\s*(?:2|II))?)?',
  'Earth and Life Science', 'Earth Science', 'Physical Science', 'General Mathematics',
  'Practical Research(?:\\s*(?:1|2|I|II))?', 'Statistics and Probability',
  '21st Century Literature', 'Reading and Writing', 'Contemporary Philippine Arts',
  'Araling Panlipunan', 'Edukasyon sa Pagpapakatao', 'Mathematics',
  'Filipino', 'Science', 'English', 'Chemistry', 'Biology', 'Physics', 'MAPEH',
];
const TITLE_RE = new RegExp(`(?:^|\\b)(${SUBJECT_TITLES.join('|')})(?=$|\\s|[,:;()])`,'i');
function sanitize(field,raw){
  const value=tidyValue(raw);
  if(!value || value.length>140 || /^\s*(?:n\/?a|none|not\s+applicable|tba|_+)\s*$/i.test(value))return '';
  if(field==='grade'){
    const m=value.match(new RegExp(`(?:^|\\b)(?:grade|gr\\.?|g)\\s*[-:]?\\s*(${yearNumber})\\b`,'i')) || value.match(new RegExp(`^(${yearNumber})(?:st|nd|rd|th)?\\s*(?:grade)?$`,'i'));
    return m?`Grade ${Number(m[1])}`:'';
  }
  if(field==='quarter'){
    const m=value.match(/\b(?:quarter|qtr\.?|q)\s*([1-4])\b/i)||value.match(/\b([1-4])(?:st|nd|rd|th)?\s+(?:quarter|grading\s*period)\b/i)||value.match(/^([1-4])$/);
    return m?`Quarter ${Number(m[1])}`:'';
  }
  if(field==='subject'){
    const cleaned=value.replace(/\s*\b(?:grade|gr\.?)\s*(?:[1-9]|1[0-2])\b.*$/i,'').replace(/\s*\b(?:quarter|qtr)\s*[1-4]\b.*$/i,'').trim();
    if(!cleaned || cleaned.length>100 || /\b(?:objectives|competencies|instruction|duration|page\s+\d+|teacher|students)\b/i.test(cleaned))return '';
    return cleaned;
  }
  if(field==='school'){
    if(value.length>100 || /\b(?:year|grade|quarter|date|subject|principal|teacher)\b/i.test(value))return '';
    return value;
  }
  return '';
}
function add(result,doc,block,field,value,rank,basis){
  value=sanitize(field,value);if(!value)return;
  result.push({field,value,rank,basis,sourceId:doc.sourceId||'',filename:doc.name||'Teaching material',
    ref:block?.ref||'Filename',excerpt:tidyValue(block?.text||value).slice(0,160)});
}
function inspectText(result,doc,block,text,primary=false){
  const lines=String(text||'').split(/\r?\n/).map(squeeze).filter(Boolean);
  for(const [lineIndex,line] of lines.entries()){
    for(const [field,regexp] of LABELS){
      const match=line.match(regexp);
      if(match) add(result,doc,block,field,match[1],4,'Labeled field');
    }
    // Short document headings, not incidental mentions in the lesson body.
    if(primary && lineIndex<20 && line.length<=85){
      const gm=line.match(new RegExp(`^(?:grade|gr\\.?|g)\\s*(${yearNumber})(?:\\s+|$)`,'i'))||line.match(new RegExp(`^(${yearNumber})(?:st|nd|rd|th)?\\s+grade\\b`,'i'));
      if(gm)add(result,doc,block,'grade',`Grade ${gm[1]}`,2,'Document heading');
      const subject=line.match(TITLE_RE);
      if(subject){
        // A stand-alone subject heading, or a short heading like "GRADE 8 SCIENCE".
        const without=line.replace(new RegExp(`\\b(?:grade|gr\\.?|g)\\s*${yearNumber}\\b`,'gi'),'').replace(/\b(?:k\s*to\s*12|senior\s*high\s*school|specialized\s*subject|curriculum\s*guide|budget\s*of\s*work|lesson\s*plan)\b/gi,'').replace(/^[\s—–:-]+/,'').trim();
        if(normal(without.split(/\s+[—–:-]\s+/)[0])===normal(subject[1]) || /^general\s+(?:chemistry|physics|biology)\b/i.test(without))add(result,doc,block,'subject',subject[1],2,'Document heading');
      }
      const quarter=line.match(/^(?:quarter|qtr\.?|q)\s*([1-4])$/i);
      if(quarter)add(result,doc,block,'quarter',`Quarter ${quarter[1]}`,2,'Document heading');
    }
  }
}
function docCandidates(doc){
  const result=[];
  const blocks=(doc.blocks||[]).filter(b=>b.selected!==false);
  let textPosition=0;
  for(const b of blocks){
    if(b.kind==='table-row' && Array.isArray(b.cells)){
      for(let c=0;c<b.cells.length;c++){
        const text=squeeze(b.cells[c].text);
        for(const [field,rx] of LABEL_CELL){
          if(rx.test(text) && c+1<b.cells.length){
            const next=b.cells[c+1];
            add(result,doc,{...b,ref:`${b.ref} → ${next.ref||next.column||''}`,text:next.text},field,next.text,4,'Table cell');
          }
        }
        inspectText(result,doc,{...b,ref:`${b.ref} / ${b.cells[c].ref||b.cells[c].column||''}`,text},text,false);
      }
    }else{
      const text=String(b.text||'');
      // First few paragraphs or first PDF page count as headings. Don't scan
      // unrelated middle pages for unlabelled subject/grade references.
      const primary=textPosition<7 || (doc.kind==='pdf' && b.page===1);
      inspectText(result,doc,b,text,primary);
      textPosition++;
    }
  }
  const filename=(doc.name||'').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
  const gradeMatch=filename.match(new RegExp(`\\b(?:grade|gr|g)\\s*(${yearNumber})\\b`,'i'));
  if(gradeMatch)add(result,doc,null,'grade',`Grade ${gradeMatch[1]}`,1,'Filename hint');
  const subjectMatch=filename.match(TITLE_RE);
  if(subjectMatch)add(result,doc,null,'subject',subjectMatch[1],1,'Filename hint');
  return result;
}
/** Result fields: { status, value, evidence, candidates, conflict }.
 * Auto-filling is allowed only for an unambiguous explicit label or heading.
 * Filename-only hints never automatically fill a field.
 */
export function detectSourceMetadata(documents=[]){
  const candidates=(documents||[]).flatMap(docCandidates);
  const fields={};
  for(const field of METADATA_FIELDS){
    const matches=candidates.filter(c=>c.field===field);
    if(!matches.length){fields[field]={status:'missing',value:'',evidence:null,candidates:[]};continue;}
    const groups=new Map();
    for(const m of matches){const key=normal(m.value);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
    const values=[...groups.values()].map(g=>g.sort((a,b)=>b.rank-a.rank)[0]).sort((a,b)=>b.rank-a.rank);
    const strong=values.filter(c=>c.rank>=2);
    if(strong.length>1){fields[field]={status:'conflict',value:'',evidence:null,candidates:values};continue;}
    if(strong.length===1){
      const best=strong[0];
      fields[field]={status:'detected',value:best.value,evidence:best,candidates:values};continue;
    }
    fields[field]={status:'hint',value:'',evidence:values[0],candidates:values};
  }
  return {fields,sourceCount:(documents||[]).length};
}
