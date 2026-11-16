import {TYPE_LABELS} from './model.js';
import {pageLayout,showSchoolInTitle} from './page-layout.js';
import {answerGroups, answerItems, cleanLogo, displayAnswer, readableText, resolveDocumentText, logoSizePx} from './document-utils.js';
const escapeHTML=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const txt=value=>escapeHTML(readableText(value)).replace(/\n/g,'<br>');
const field=(value,settings)=>txt(resolveDocumentText(value,settings));
// Escaping for a CSS quoted string, not an HTML attribute. Embedded markup
// boundaries remain text nodes in printPDF's <style> element.
const cssString=value=>String(value??'').replace(/\\/g,'\\\\').replace(/"/g,'\\"')
  .replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/[<>]/g,c=>c==='<'?'\\3c ':'\\3e ');
const answerExplanation=q=>q.explanation?.trim()?`<p class="paper-key-explanation"><strong>Explanation:</strong> ${txt(q.explanation)}</p>`:'';
function longAnswerHTML({q,number}, settings) {
  const items=answerItems(q.answer,q.type);
  const answer=items.length?(q.type==='enumeration'
    ?`<ol class="paper-key-answers">${items.map(v=>`<li>${txt(v)}</li>`).join('')}</ol>`
    :`<div class="paper-key-prose">${items.map(v=>`<p>${txt(v)}</p>`).join('')}</div>`)
    :'<p class="paper-empty-answer">No answer supplied</p>';
  return `<article class="paper-key-block"><p class="paper-key-stem"><span>${number}.</span> ${txt(q.text)}</p>${answer}${settings.includeExplanations?answerExplanation(q):''}</article>`;
}
function answerKeyMarkup(questions,settings){
  if(!settings.includeAnswerKey)return '';
  let h=`<section class="answer-key"><h1 class="paper-title">ANSWER KEY</h1><p class="paper-key-subtitle">${questions.length} questions · ${txt(settings.title||'Assessment')}</p>`;
  if(settings.answerKeyLayout==='sequential') {
    h+='<div class="paper-key-list">';
    questions.forEach((q,i)=>{
      if(q.type==='essay'||q.type==='enumeration')h+=longAnswerHTML({q,number:i+1},settings);
      else h+=`<article class="paper-key-simple"><strong class="paper-key-num">${i+1}.</strong><span>${txt(displayAnswer(q))}</span>${settings.includeExplanations?answerExplanation(q):''}</article>`;
    });
    return h+'</div></section>';
  }
  for(const group of answerGroups(questions)){
    h+=`<h2 class="paper-key-section">${escapeHTML(group.label)} <small>${group.rows.length} ${group.rows.length===1?'question':'questions'}</small></h2>`;
    if((group.type==='multiple_choice'||group.type==='true_false')&&!settings.includeExplanations){
      h+='<div class="paper-key-grid">';
      group.rows.forEach(({q,number})=>h+=`<div class="paper-key-chip"><strong>${String(number).padStart(2,'0')}</strong><span>${txt(displayAnswer(q))}</span></div>`);
      h+='</div>';
    }else if(['multiple_choice','true_false','identification'].includes(group.type)){
      h+='<div class="paper-key-list">';
      group.rows.forEach(({q,number})=>h+=`<article class="paper-key-simple"><strong class="paper-key-num">${number}.</strong><span>${txt(displayAnswer(q))}</span>${settings.includeExplanations?answerExplanation(q):''}</article>`);
      h+='</div>';
    }else group.rows.forEach(item=>h+=longAnswerHTML(item,settings));
  }
  return h+'</section>';
}
export function renderPaper(questions,settings,{preview=false,previewSection='full'}={}){
  const pageSize=['A4','Letter','Legal'].includes(settings.paper)?settings.paper:'A4';
  const layout=pageLayout(settings);
  const fontMap={Aptos:'Aptos, "Segoe UI", Arial, sans-serif',Arial:'Arial, sans-serif',Calibri:'Calibri, Arial, sans-serif','Times New Roman':'"Times New Roman", serif'};
  const face=fontMap[settings.font]||fontMap.Aptos;
  const logoPx=logoSizePx(settings);
  const headerLogoPx=Math.min(logoPx,Math.floor(Math.max(10,layout.mm.top-4.5)/25.4*96));
  const logoMM=(headerLogoPx/96*25.4).toFixed(2);
  const spacing=settings.spacing==='compact'?'7px':settings.spacing==='relaxed'?'15px':'10px';
  const logo=cleanLogo(settings), logoImg=logo?`<img class="paper-logo" style="max-width:${settings.logoPlacement==='header'?headerLogoPx:logoPx}px;max-height:${settings.logoPlacement==='header'?headerLogoPx:logoPx}px" src="${escapeHTML(logo.data)}" alt="Institution logo">`:'';
  const left=field(settings.headerLeft,settings),center=field(settings.headerCenter,settings),right=field(settings.headerRight,settings);
  const footerLeft=field(settings.footerLeft,settings),footerCenter=field(settings.footerCenter,settings),footerRight=field(settings.footerRight,settings);
  const printHeaderLeft=cssString(resolveDocumentText(settings.headerLeft,settings));
  const printHeaderCenter=cssString(resolveDocumentText(settings.headerCenter,settings));
  const printHeaderRight=cssString(resolveDocumentText(settings.headerRight,settings));
  const printFooterLeft=cssString(resolveDocumentText(settings.footerLeft,settings));
  const printFooterCenter=cssString(resolveDocumentText(settings.footerCenter,settings));
  const printFooterRight=cssString(resolveDocumentText(settings.footerRight,settings));
  const printLogo=logo&&settings.logoPlacement==='header'?`background-image:url("${logo.data}");background-repeat:no-repeat;background-size:${logoMM}mm auto;background-position:left center;padding-left:${(Number(logoMM)+2).toFixed(2)}mm;`:'';
  const header=(left||center||right||(logo&&settings.logoPlacement==='header'))?
    `<div class="paper-running-header"><span class="paper-header-left">${logo&&settings.logoPlacement==='header'?logoImg:''}${left}</span><span class="paper-header-center">${center}</span><span class="paper-header-right">${right}</span></div>`:'';
  const footer=(footerLeft||footerCenter||footerRight||settings.showPageNumbers)?
    `<div class="paper-running-footer"><span>${footerLeft}</span><span>${footerCenter}</span><span>${footerRight}</span>${settings.showPageNumbers?'<span class="paper-preview-pages">Page 1 of …</span>':''}</div>`:'';
  const h=[];
  h.push(`${header}<div class="paper-content" style="font-family:${face};font-size:${Math.max(9,Math.min(16,Number(settings.fontSize)||11))}pt;line-height:1.45">`);
  if(previewSection!=='answerKey') {
  if(logo&&settings.logoPlacement==='title')h.push(`<div class="paper-title-logo">${logoImg}</div>`);
  if(showSchoolInTitle(settings))h.push(`<div class="paper-school">${txt(settings.school)}</div>`);
  h.push(`<h1 class="paper-title">${txt(settings.title||'Practice Assessment')}</h1>`);
  if(settings.subtitle?.trim())h.push(`<div class="paper-subtitle">${txt(settings.subtitle)}</div>`);
  if(settings.subject?.trim())h.push(`<p><strong>Subject:</strong> ${txt(settings.subject)}</p>`);
  if(settings.showStudentFields)h.push('<div class="paper-student-fields"><span>Name: _________________________</span><span>Section: _________________</span><span>Date: __________________</span><span>Score: __________</span></div>');
  if(settings.instructions?.trim())h.push(`<p class="paper-instructions"><strong>Instructions:</strong> ${txt(settings.instructions)}</p>`);
  h.push(`<div class="paper-questions" style="column-count:${layout.columns};column-gap:8mm">`);
  let lastType='';
  questions.forEach((q,i)=>{
    if(lastType!==q.type){h.push(`<h2 class="paper-section">${escapeHTML(TYPE_LABELS[q.type]||'Questions')}</h2>`);lastType=q.type;}
    h.push(`<div class="paper-question" style="margin-bottom:${spacing}"><p class="paper-qtext"><strong>${i+1}.</strong> ${txt(q.text)}${settings.showPoints?` <em>(${Number(q.points)||1} pts)</em>`:''}</p>`);
    if(q.type==='multiple_choice'){
      h.push('<div class="paper-choices">');
      (q.options||[]).filter(o=>o.text?.trim()).forEach(o=>h.push(`<div><strong>${escapeHTML(o.label)}.</strong> ${txt(o.text)}</div>`));
      h.push('</div>');
    }else if(q.type==='true_false')h.push('<div class="paper-choices">☐ True &nbsp;&nbsp;&nbsp; ☐ False</div>');
    else if(q.type==='identification')h.push('<div class="paper-blank">Answer: _______________________________________________</div>');
    else if(q.type==='enumeration')h.push(`<div class="paper-choices">${Array.from({length:Math.min(20,Math.max(1,Number(q.expectedCount)||3))},(_,j)=>`<div>${j+1}) ________________________________________</div>`).join('')}</div>`);
    else h.push(`<div class="paper-essay">${Array.from({length:Math.min(12,Math.max(2,Number(settings.answerLines)||4))},()=>'<div class="paper-writing-line"></div>').join('')}</div>`);
    h.push('</div>');
  });
  h.push('</div>');
  }
  if(previewSection!=='questions')h.push(answerKeyMarkup(questions,settings));
  h.push('</div>',footer);
  const css=`
    @page {
      size:${pageSize}; margin:${layout.mm.top}mm ${layout.mm.right}mm ${layout.mm.bottom}mm ${layout.mm.left}mm;
      @top-left { content:"${printHeaderLeft}"; color:#47627f;font:600 8pt Arial,sans-serif; ${printLogo} }
      @top-center { content:"${printHeaderCenter}"; color:#394b5f;font:600 8pt Arial,sans-serif; }
      @top-right { content:"${printHeaderRight}"; color:#667b94;font:8pt Arial,sans-serif; }
      @bottom-left { content:"${printFooterLeft}"; color:#677d95;font:8pt Arial,sans-serif; }
      @bottom-center { content:"${printFooterCenter}"; color:#677d95;font:8pt Arial,sans-serif; }
      @bottom-right { content:"${printFooterRight}${printFooterRight&&settings.showPageNumbers?'  ·  ':''}" ${settings.showPageNumbers?'"Page " counter(page) " of " counter(pages)':''}; color:#5b6f87;font:8pt Arial,sans-serif; }
    }
    html,body { background:#fff!important; color:#172335!important; margin:0; }
    .paper-content{color:#172335;background:white;overflow-wrap:break-word;word-break:normal;}
    .paper-logo{object-fit:contain;width:auto;height:auto;max-width:${logoPx}px;max-height:${logoPx}px;display:block;}
    .paper-title-logo{display:flex;justify-content:center;margin:0 0 12px;}
    .paper-running-header{display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;gap:10px;padding:5px 0 8px;border-bottom:1px solid #cfdeee;color:#46617f;font:600 10px Arial,sans-serif;min-height:39px;}
    .paper-header-left{display:flex;align-items:center;gap:6px;min-width:0;overflow-wrap:anywhere;}
    .paper-header-center{min-width:0;text-align:center;overflow-wrap:anywhere;}
    .paper-header-right{min-width:0;text-align:right;overflow-wrap:anywhere;}
    .paper-running-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid #d2deea;padding:8px 0;color:#6a7b90;font:9px Arial,sans-serif;}
    .paper-preview-pages{color:#4872a2;white-space:nowrap;}
    .paper-school{text-align:center;font-weight:700;margin-bottom:9px;}
    .paper-title{font-size:1.5em;line-height:1.25;text-align:center;color:#183c6a;margin:0 0 9px;}
    .paper-subtitle{text-align:center;margin-bottom:17px;color:#45546a;}
    .paper-student-fields{display:flex;flex-wrap:wrap;gap:8px 25px;margin:18px 0;font-size:.92em;}
    .paper-instructions{margin:16px 0 22px;}
    .paper-section{break-inside:avoid; font-size:1.15em;color:#1b4b80;padding-bottom:5px;border-bottom:1px solid #a8c5dd;margin:23px 0 13px;break-after:avoid;}
    .paper-questions{column-fill:auto;}
    .paper-question{break-inside:avoid;break-inside:avoid-column;}.paper-qtext{margin:0 0 8px;white-space:normal;}.paper-qtext em{color:#7a8190;font-size:.83em;font-style:normal;}
    .paper-choices{padding-left:28px;display:grid;gap:6px;margin:8px 0 12px;}.paper-blank{padding:12px 20px;}
    .paper-essay{margin:9px 12px 12px;}.paper-writing-line{border-bottom:1px solid #9fa8b8;height:24px;}
    .answer-key{break-before:page;page-break-before:always;padding-top:4px;}
    .paper-key-subtitle{text-align:center;color:#63758b;font-size:.88em;margin:0 0 19px;}
    .paper-key-section{font-size:1.05em;line-height:1.3;color:#1b4b80;border-bottom:1px solid #bccfe1;padding:9px 0 7px;margin:21px 0 12px;break-after:avoid;}
    .paper-key-section small{font-size:.73em;font-weight:400;color:#71839a;margin-left:8px;}
    .paper-key-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:17px;}
    .paper-key-chip{border:1px solid #d7e3ef;background:#f5f8fc;display:flex;align-items:center;gap:12px;min-height:32px;padding:7px 10px;break-inside:avoid;border-radius:4px;}
    .paper-key-chip strong{font-size:.85em;color:#6281a9;}.paper-key-chip span{font-weight:700;color:#213e60;min-width:0;}
    .paper-key-list{display:grid;gap:7px;}
    .paper-key-simple{display:grid;grid-template-columns:30px minmax(0,1fr);gap:3px 8px;padding:6px 1px;break-inside:avoid;}
    .paper-key-num{color:#2e5b90;}.paper-key-simple>span{white-space:pre-wrap;overflow-wrap:break-word;}
    .paper-key-explanation{grid-column:2;color:#56677a;font-size:.9em;margin:3px 0 9px;white-space:pre-wrap;}
    .paper-key-block{padding:9px 0 15px;break-inside:avoid;}
    .paper-key-stem{font-weight:700;color:#23486d;margin:0 0 8px;}.paper-key-stem span{color:#2e65a0;}
    .paper-key-answers{margin:0 0 0 31px;padding-left:15px;}.paper-key-answers li{margin:4px 0;white-space:pre-wrap;}
    .paper-key-prose{margin-left:30px;white-space:pre-wrap;}.paper-key-prose p{margin:0 0 6px;}
    .paper-empty-answer{color:#8d96a5;font-style:italic;margin-left:30px;}
    @media print {
      .paper-running-header,.paper-running-footer{display:none!important;}
      .paper-preview-pages{display:none!important;}
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    }
  `;
  return {markup:h.join(''),css};
}
export function printPDF(questions,settings){
  if(!questions.length)throw new Error('Add at least one question before printing.');
  const {markup,css}=renderPaper(questions,settings);
  const popup=window.open('','_blank');
  if(!popup)throw new Error('Allow pop-ups for the extension to print or save as PDF.');
  // Build privileged print document with DOM nodes. Never interpolate CSS into
  // an HTML parser context: custom headers are untrusted teacher-provided text.
  const doc=popup.document;
  const title=doc.createElement('title');title.textContent=`${settings.title||'Assessment'} — Print / Save as PDF`;
  const meta=doc.createElement('meta');meta.setAttribute('charset','utf-8');
  const style=doc.createElement('style');style.textContent=css;
  doc.head.replaceChildren(meta,title,style);
  // renderPaper HTML escapes every untrusted question and answer field.
  const root=doc.createElement('main');root.innerHTML=markup;
  doc.body.replaceChildren(root);
  popup.focus();
  setTimeout(()=>{try{popup.print();}catch{}},500);
}
