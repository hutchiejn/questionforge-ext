import {newQuestion, validateQuestion} from './model.js';

const TYPE_PATTERNS = [
  [/^(?:multiple[\s-]*choice|mcq|choose the (?:best|correct) answer)s?\b/i,'multiple_choice'],
  [/^(?:identification|identify|fill in the blanks?|short answer)s?\b/i,'identification'],
  [/^(?:enumeration|listing|list the following)s?\b/i,'enumeration'],
  [/^(?:essay|discussion|long answer)s?\b/i,'essay'],
  [/^(?:true\s*(?:\/|or|-)\s*false|true or false)s?\b/i,'true_false'],
];
function cleanMarkdown(value) {
  return String(value ?? '').replace(/^\s{0,3}(?:#{1,6}\s*)?/, '')
    .replace(/\*\*/g, '').replace(/__([^_]+)__/g, '$1')
    .replace(/\\\s*$/, '') // ChatGPT Markdown hard line breaks
    .trim();
}
function sectionType(raw) {
  const line = cleanMarkdown(raw)
    .replace(/^part\s+(?:[IVXLCDM]+|\d+)\s*[.)\-:]\s*/i, '')
    .replace(/^section\s+\d+\s*[.)\-:]?\s*/i, '')
    .trim();
  // Accept familiar headings and headings followed by 'Directions:', not prose.
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(line) && (line.length < 45 || /\bdirections\s*:/i.test(line)) &&
        (/^(?:multiple[\s-]*choice|mcq|identification|enumeration|essay|true\s*(?:\/|or|-)\s*false)(?:\s*$|\s*[:：]?$|\s*[·—-]\s*\d+\s+questions?\b|\s+directions\s*:)/i.test(line))) return type;
  }
  return null;
}
function numberMatch(line) {
  // Handles **1.** Question as well as 1. Question and Q1) Question.
  const cleaned = cleanMarkdown(line).replace(/^[-*]\s+(?=(?:Q(?:uestion)?\s*)?\d+)/i, '');
  const match = cleaned.match(/^(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.)]\s+(.+?)\s*$/i);
  if (!match) return null;
  return {number: Number(match[1]), text: cleanMarkdown(match[2])};
}

/** Split the teacher's answer key from exam questions BEFORE searching for numbers.
 * Otherwise e.g. '21. Answer Key' and a numbered answer table become fake questions.
 */
export function splitAssessmentAndKey(raw) {
  const input = String(raw ?? '').replace(/\r\n?/g, '\n');
  const lines = input.split('\n');
  const start = lines.findIndex(line => {
    const clean = cleanMarkdown(line).replace(/^part\s+(?:[IVXLCDM]+|\d+)\s*[.)\-:]\s*/i,'').trim();
    return /^(?:(?:\d{1,2})\s*[.)]\s*)?answer\s+key\b/i.test(clean) ||
      /^teacher\s*(?:answer|marking)\s+key\b/i.test(clean);
  });
  if (start < 0) return {assessment:input,answerKey:''};
  return {assessment:lines.slice(0,start).join('\n'),answerKey:lines.slice(start+1).join('\n')};
}

function isBlankAnswer(value) {
  return /^[\s\\_\-–—.]*$/.test(value);
}

/** Conservative answer-key import. Only explicitly keyed question numbers are mapped.
 * Ambiguous material is left for the user to review; never guess an answer.
 */
function mergeExplicitKey(questions, key) {
  if (!key.trim()) return;
  const byNumber = new Map(questions.map((q,i)=>[q._sourceNumber ?? i+1,q]));
  const lines = key.split('\n');
  let section='', active=null, entries=[];
  function assign(number, answer, explanation='') {
    const question = byNumber.get(Number(number));
    if (!question || !answer.trim()) return;
    if (!question.answer.trim() || isBlankAnswer(question.answer)) question.answer=answer.trim();
    if (!question.explanation.trim() && explanation.trim()) question.explanation=explanation.trim();
  }
  function flush() {
    if (active && entries.length) {
      const q=byNumber.get(active);
      const clean=entries.map(x=>x.trim()).filter(Boolean);
      if (q?.type==='enumeration') assign(active, clean.map(x=>x.replace(/^(?:[-*]|\d+[.)])\s*/, '')).join('\n'));
      else if (q?.type==='essay') assign(active,clean.join(' '));
    }
    active=null;entries=[];
  }
  for (let i=0;i<lines.length;i++) {
    const original=lines[i], line=cleanMarkdown(original);
    const type=sectionType(original);
    if (type) {flush();section=type;continue;}
    if (/^essay\s*[—-]\s*suggested\s+answer\s+guide/i.test(line)) {flush();section='essay';continue;}
    if (!line || /^[-|: ]+$/.test(line) || /^(?:no\.|correct answer|explanation|teacher reference)\s*$/i.test(line)) continue;
    // Standard markdown tables: | 1 | A | Explanation ... |
    const cells=original.trim().startsWith('|') ? original.split('|').slice(1,-1).map(cleanMarkdown) : null;
    if (cells && /^\d{1,3}$/.test(cells[0]||'') && cells[1] && !/^[-: ]+$/.test(cells[1])) {
      flush();assign(Number(cells[0]),cells[1],cells.slice(2).join(' ').trim());continue;
    }
    // E.g. '1 A Explanation' or '11 Proton' inside an explicit key section.
    const tabular=line.match(/^(\d{1,3})[.)]?\s+([A-D])(?:\s+(.+))?$/i);
    if (section==='multiple_choice' && tabular) {
      flush();assign(Number(tabular[1]),tabular[2].toUpperCase(),tabular[3]||'');continue;
    }
    const identification=line.match(/^(\d{1,3})[.)]?\s+(.+)$/);
    if (section==='identification' && identification && byNumber.get(Number(identification[1]))?.type==='identification') {
      flush();assign(Number(identification[1]), identification[2]);continue;
    }
    // Numbered teacher answer headings, followed by a bullet list or prose.
    const title=line.match(/^(\d{1,3})[.)]\s+(.+)$/);
    if (title && (section==='enumeration'||section==='essay') && byNumber.get(Number(title[1]))?.type===section) {
      flush();active=Number(title[1]);continue;
    }
    if (active) {
      if (/^#{1,6}\s/.test(original)) {flush();continue;}
      entries.push(line);
    }
  }
  flush();
}

function detectType(q) {
  if (q.type) return q.type;
  if (q.options.length >= 2) return 'multiple_choice';
  if (/^(?:true|false)$/i.test(q.answer.trim())) return 'true_false';
  if (q.expectedCount > 0 || /^(?:list|enumerate|name \d+|give \d+|state \d+)/i.test(q.text.trim())) return 'enumeration';
  if (/^(?:explain|discuss|describe|evaluate|analy[sz]e|compare|justify|write an essay)/i.test(q.text.trim())) return 'essay';
  return 'identification';
}
function parseJSON(text) {
  const source = text.trim();
  // ChatGPT sometimes wraps otherwise valid JSON inside a single fenced code block.
  const fenced=source.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i);
  const trimmed=(fenced?fenced[1]:source).trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;
  try {
    const parsed=JSON.parse(trimmed);
    const items=Array.isArray(parsed)?parsed:parsed.questions;
    if(!Array.isArray(items)) return {questions:[],warnings:['JSON must contain a questions array.']};
    if(items.length>500)return {questions:[],warnings:['JSON contains over 500 questions. Split the assessment into smaller imports.']};
    const warnings=[];
    const allowed=new Set(['multiple_choice','identification','enumeration','essay','true_false']);
    const questions=items.map((item,i)=>{
      if(!item || typeof item!=='object'||Array.isArray(item))throw Error(`Question ${i+1} is not a valid question object.`);
      const stem=String(item.question??item.text??'');
      const answer=typeof item.answer==='string'?item.answer:String(item.answer??'');
      if(stem.length>12000||answer.length>30000||String(item.explanation??'').length>30000)
        throw Error(`Question ${i+1} is too large for a safe import.`);
      if(Array.isArray(item.options)&&(item.options.length>8||item.options.some(v=>String(typeof v==='object'?(v?.text??''):v).length>12000)))
        throw Error(`Question ${i+1} has too many or oversized answer choices.`);
      const type=allowed.has(item.type)?item.type:'identification';
      if(!allowed.has(item.type))warnings.push(`Question ${i+1}: Unrecognized question type.`);
      const options=Array.isArray(item.options)?item.options.map((o,index)=>({
        label:typeof o==='object'&&o!==null?String(o.label??String.fromCharCode(65+index)):String.fromCharCode(65+index),
        text:typeof o==='object'&&o!==null?String(o.text??''):String(o),
      })):[];
      if(item.number!==undefined && item.number!==i+1)warnings.push(`Question ${i+1}: Expected question number ${i+1}, found ${item.number}.`);
      if(!answer.trim())warnings.push(`Question ${i+1}: Missing correct answer or model answer.`);
      if(type==='multiple_choice'&&options.length!==4)warnings.push(`Question ${i+1}: Multiple choice requires exactly four options (A–D).`);
      return {...newQuestion(type),type,text:stem,answer,
        explanation:String(item.explanation??''),options,
        points:Math.max(0,Number(item.points)||1),expectedCount:Math.max(1,Number(item.expectedCount)||1)};
    });
    if(!Array.isArray(parsed)){
      const expected=Number(parsed.expected_total);
      if(Number.isInteger(expected)&&expected!==questions.length)
        warnings.unshift(`Expected ${expected} questions, but the JSON contains ${questions.length}. Check the chatbot response before exporting.`);
      if(parsed.type_counts && typeof parsed.type_counts==='object'){
        for(const [type,expectedCount] of Object.entries(parsed.type_counts)){
          const count=questions.filter(q=>q.type===type).length;
          if(Number.isInteger(Number(expectedCount))&&count!==Number(expectedCount))
            warnings.push(`Type count mismatch: expected ${expectedCount} ${type} questions; found ${count}.`);
        }
      }
    }
    questions.forEach((q,i)=>validateQuestion(q).forEach(issue=>warnings.push(`Question ${i+1}: ${issue}`)));
    return {questions,warnings};
  }catch(error){
    return {questions:[],warnings:[`Invalid JSON: ${error.message}. Ask your chatbot to return only valid JSON, or use the formatting repair prompt.`]};
  }
}

/**
 * Chrome/ChatGPT sometimes supplies one long paragraph instead of preserving
 * question/option/answer line breaks. Restore the explicit structural markers
 * before using the regular line-oriented parser. This does not use AI and does
 * not infer or change the substance of a question or its answer.
 *
 * We deliberately only split at recognizable labels; ordinary text stays put.
 */
export function normalizeQuestionLayout(raw) {
  const input = String(raw ?? '').replace(/\r\n?/g, '\n');
  const sections = /(?:MULTIPLE[ \t-]+CHOICE|IDENTIFICATION|ENUMERATION|ESSAY|TRUE[ \t\/-]+FALSE)/g;
  let result = input.replace(sections, (match, offset, source) => {
    // Inline, uppercase section headings followed by a numbered question.
    // Do not split a phrase just because it mentions a type in a sentence.
    const before = source.slice(0, offset);
    const after = source.slice(offset + match.length);
    if ((!before || /\s$/.test(before)) && /^\s*\d{1,3}[.)]\s+/.test(after)) {
      return `\n${match}\n`;
    }
    return match;
  });
  // Numbered questions, including those embedded after an answer or explanation.
  // The whitespace requirement prevents splitting decimal numbers such as 3.14.
  result = result.replace(/[ \t]+(?=\d{1,3}[.)][ \t]+[^\s])/g, '\n');
  // Lettered multiple-choice options (A. to H. / A) to H)).
  result = result.replace(/[ \t]+(?=[A-H][.)][ \t]+[^\s])/g, '\n');
  // Explicit answer and explanation labels, even after inline options.
  result = result.replace(/[ \t]+(?=(?:(?:correct[ \t]+)?answers?|explanation|rationale|reason)[ \t]*[:：][ \t]*)/gi, '\n');

  // When an enumeration answer was pasted as "Answer:  Item one  Item two",
  // preserve item boundaries by converting *double* spaces into line breaks.
  // Single-spaced prose is left intact instead of guessing a list structure.
  const output=[];
  let section=null;
  for (const row of result.split('\n')) {
    const heading=sectionType(row);
    if (heading) section=heading;
    if (section==='enumeration' && /^\s*(?:correct[ \t]+)?answers?[ \t]*[:：]/i.test(row)) {
      const match=row.match(/^(\s*(?:(?:correct[ \t]+)?answers?)[ \t]*[:：])[ \t]*(.*)$/i);
      if (match) {
        const parts=match[2].trim().split(/[ \t]{2,}/).filter(Boolean);
        if (parts.length>1) {
          output.push(`${match[1]} ${parts[0]}`, ...parts.slice(1));
          continue;
        }
      }
    }
    output.push(row);
  }
  return output.join('\n');
}

/** Deterministic parser. It NEVER invents answers; review warnings before export. */
export function parseQuestions(raw) {
  const input = String(raw ?? '').replace(/\r\n?/g,'\n').trim();
  if(input.length>1_000_000)return {questions:[],warnings:['Input exceeds the 1 million character safety limit. Import a smaller assessment.']};
  if (!input) return {questions:[], warnings:['Paste some questions to begin.']};
  const json = parseJSON(input);
  if (json) return json;

  const {assessment, answerKey} = splitAssessmentAndKey(input);
  const lines = normalizeQuestionLayout(assessment).split('\n');
  const questions = []; const warnings = [];
  let current=null, heading=null, answerMode=false, explanationMode=false, inCode=false;
  let lastNumber=0;
  function flush() {
    if (!current) return;
    current.text = current.text.trim();
    current.answer = current.answer.trim();
    current.explanation = current.explanation.trim();
    current.type = detectType(current);
    if (current.type==='enumeration' && !current.expectedCount) {
      const countWords={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
      const expected=current.text.match(/\b(?:name|list|enumerate|give|state|identify|mention|provide)\s+(?:(?:at least|any|the)\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
      if (expected) current.expectedCount=Number(expected[1])||countWords[expected[1].toLowerCase()];
      // If no number is stated but a clearly itemized answer is provided,
      // use its line count rather than inventing the number of blanks.
      else if (current.answer.split('\n').filter(x=>x.trim()).length>1) {
        current.expectedCount=current.answer.split('\n').filter(x=>x.trim()).length;
      }
    }
    current._sourceNumber = current._parsedNumber || lastNumber + 1;
    questions.push(current); lastNumber = current._sourceNumber;
    if(questions.length>500)throw Error('More than 500 questions were found. Import a smaller assessment.');
    delete current._parsedNumber;
    current=null;
    answerMode=false; explanationMode=false; inCode=false;
  }
  for (let i=0;i<lines.length;i++) {
    const rawLine=lines[i]; const line=cleanMarkdown(rawLine);
    if (!inCode && sectionType(rawLine)) {
      flush(); heading=sectionType(rawLine); continue;
    }
    const m = !inCode ? numberMatch(rawLine) : null;
    // Avoid treating numbered items inside an enumeration answer as new questions.
    const looksLikeNewQuestion = m && /^(?:what|which|who|why|how|when|where|name|list|enumerate|give|state|identify|mention|provide|explain|describe|discuss|compare|differentiate|define|write|select|choose)\b/i.test(m.text);
    const enumAnswerItem = Boolean(current && answerMode && (current.type === 'enumeration' || heading === 'enumeration') && m &&
      !looksLikeNewQuestion && !/\?$/.test(m.text) && m.number <= 12 &&
      m.number <= (current.expectedCount || 12));
    if (m && !enumAnswerItem && (!current || m.number > (current._parsedNumber || lastNumber) || !answerMode)) {
      flush();
      current = newQuestion(heading ?? '');
      current.type = heading ?? '';
      current.options=[];
      current.expectedCount=0;
      current.text=m.text; current._parsedNumber=m.number;
      continue;
    }
    if (!current) continue;
    // Blank answer lines and enumeration slots are not question text or keys.
    if ((current.type==='enumeration' || heading==='enumeration') && /^\d+[.)]\s*(?:_+)?$/.test(line)) continue;
    if (/^```/.test(rawLine.trim())) {
      inCode=!inCode; current.text += '\n' + rawLine.trim(); continue;
    }
    if (inCode) {current.text += '\n' + rawLine;continue;}
    const typeLine = line.match(/^type\s*:\s*(.+)$/i);
    if (typeLine) {const t=sectionType(typeLine[1]);if(t)current.type=t;continue;}
    const pointsMatch=line.match(/^(?:points?|marks?)\s*:\s*(\d+)/i);
    if (pointsMatch){current.points=Number(pointsMatch[1]);continue;}
    const expectedMatch=line.match(/^(?:expected(?:\s+answers?)?|items?)\s*:\s*(\d+)/i);
    if (expectedMatch){current.expectedCount=Number(expectedMatch[1]);continue;}
    const answerMatch=line.match(/^(?:correct\s+)?answers?\s*[:：-]\s*(.*)$/i);
    if (answerMatch){answerMode=true;explanationMode=false;
      if(answerMatch[1] && !isBlankAnswer(answerMatch[1])) current.answer+=(current.answer?'\n':'')+answerMatch[1]; continue;}
    const explanationMatch=line.match(/^(?:explanation|rationale|reason)\s*[:：-]\s*(.*)$/i);
    if (explanationMatch){answerMode=false;explanationMode=true;
      if(explanationMatch[1])current.explanation+=(current.explanation?'\n':'')+explanationMatch[1];continue;}
    if (!line) {if (!answerMode && !explanationMode && current.text)current.text+='\n';continue;}
    // A. Choice or A) Choice; accept up to H.
    const opt = !answerMode && !explanationMode ? rawLine.match(/^\s*(?:[-*]\s*)?([A-Ha-h])\s*[.)]\s*(.+?)\s*$/) : null;
    if (opt) {
      current.options.push({label:opt[1].toUpperCase(),text:cleanMarkdown(opt[2])});
      current.type='multiple_choice'; continue;
    }
    if (answerMode) current.answer+=(current.answer?'\n':'')+line;
    else if (explanationMode)current.explanation+=(current.explanation?'\n':'')+line;
    else current.text+=(current.text?'\n':'')+rawLine.trim();
  }
  flush();
  mergeExplicitKey(questions,answerKey);
  // Internally retain question numbers only while importing the answer key.
  questions.forEach(q=>delete q._sourceNumber);
  if (!questions.length) warnings.push('No numbered questions found. Use “1. Question…” or import structured JSON.');
  questions.forEach((q,i)=>validateQuestion(q).forEach(issue=>warnings.push(`Question ${i+1}: ${issue}`)));
  return {questions,warnings};
}
