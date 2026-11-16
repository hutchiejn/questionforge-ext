export const TYPES = [
  { key: 'multiple_choice', label: 'Multiple choice', short: 'MCQ' },
  { key: 'identification', label: 'Identification', short: 'ID' },
  { key: 'enumeration', label: 'Enumeration', short: 'LIST' },
  { key: 'essay', label: 'Essay', short: 'ESSAY' },
  { key: 'true_false', label: 'True / False', short: 'T/F' },
];
export const TYPE_LABELS = Object.fromEntries(TYPES.map(item => [item.key, item.label]));
export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'student', title: 'Practice Assessment', subtitle: '', school: '', subject: '',
  instructions: 'Read each question carefully. Write your answers clearly.',
  paper: 'A4', font: 'Calibri', fontSize: 11, spacing: 'normal',
  margins: 'normal', pageColumns: 1,
  theme: 'dark', logoSizePx: 32,
  includeAnswerKey: true, includeExplanations: false,
  showPoints: false, showStudentFields: true, answerLines: 4,
  answerKeyLayout: 'grouped', headerLeft: '', headerCenter: '', headerRight: '', avoidDuplicateSchool: true,
  footerLeft: '', footerCenter: '', footerRight: '', showPageNumbers: true,
  brandLogo: null, logoPlacement: 'header',
});
export function newQuestion(type='multiple_choice') {
  return { id: globalThis.crypto?.randomUUID?.() ?? `q-${Date.now()}-${Math.random().toString(36).slice(2)}`, type, text: '', options: type === 'multiple_choice' ? [
    { label: 'A', text: '' }, { label: 'B', text: '' },
    { label: 'C', text: '' }, { label: 'D', text: '' },
  ] : [], answer: '', explanation: '', points: 1, expectedCount: 3, section: '' };
}
export function validateQuestion(q) {
  const issues = [];
  if (!q.text?.trim()) issues.push('Question text is empty');
  if (q.type === 'multiple_choice') {
    if ((q.options ?? []).filter(o => o.text?.trim()).length < 2) issues.push('Add at least two answer choices');
    if (q.answer?.trim() && /^[A-Z]$/i.test(q.answer.trim())) {
      if (!(q.options ?? []).some(o => o.label.toUpperCase() === q.answer.trim().toUpperCase() && o.text?.trim())) {
        issues.push('Answer letter does not match an available choice');
      }
    }
  }
  if (q.type === 'enumeration' && (!Number.isInteger(Number(q.expectedCount)) || Number(q.expectedCount) < 1)) issues.push('Set the expected number of answers');
  return issues;
}
export function createDemoQuestions() {
  const sample = [
    {
      type:'multiple_choice', text:'Which HTML element represents the main heading of a page?',
      options:[{label:'A',text:'<p>'},{label:'B',text:'<h1>'},{label:'C',text:'<head>'},{label:'D',text:'<title>'}],
      answer:'B',explanation:'The <h1> element identifies the top-level heading.',points:1,
    },
    {type:'identification',text:'Which Python framework is known for its built-in admin interface?',options:[],answer:'Django',points:1},
    {type:'enumeration',text:'List three common technologies used to build a webpage.',options:[],answer:'HTML\nCSS\nJavaScript',expectedCount:3,points:3},
    {type:'essay',text:'Explain why separating presentation and business logic improves software maintainability.',options:[],answer:'Discuss separation of concerns, testability, and maintainability.',points:5},
    {type:'true_false',text:'A password should be stored in plaintext in a public repository.',options:[],answer:'False',points:1}
  ];
  return sample.map(s => ({...newQuestion(s.type),...s}));
}
