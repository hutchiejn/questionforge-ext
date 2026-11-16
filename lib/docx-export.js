import {createZip} from './zip.js';
import {TYPE_LABELS} from './model.js';
import {pageLayout,showSchoolInTitle} from './page-layout.js';
import {answerGroups, answerItems, cleanLogo, displayAnswer, readableText, resolveDocumentText, logoSizePx} from './document-utils.js';

const esc = value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const DOC_NS = `xmlns:w="${W}" xmlns:r="${R}" xmlns:a="${A}" xmlns:pic="${PIC}" xmlns:wp="${WP}"`;
const relNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
const relBase = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const color=(s)=>`<w:color w:val="${s}"/>`;
function run(value, {bold=false, color:ink='', size:pt=0, italic=false}={}) {
  const prop=`${bold?'<w:b/>':''}${italic?'<w:i/>':''}${ink?color(ink):''}${pt?`<w:sz w:val="${pt}"/>`:''}`;
  const chunks=readableText(value).split('\n').map((part,i)=>`${i?'<w:br/>':''}<w:t xml:space="preserve">${esc(part)}</w:t>`).join('');
  return `<w:r>${prop?`<w:rPr>${prop}</w:rPr>`:''}${chunks}</w:r>`;
}
function paragraph(parts, {style='',after=90,before=0,indent=0, align='',keepNext=false,keepLines=false,breakBefore=false, bottomBorder=false, tabs=''}={}) {
  const ppr=`<w:pPr>${style?`<w:pStyle w:val="${style}"/>`:''}${align?`<w:jc w:val="${align}"/>`:''}<w:spacing w:before="${before}" w:after="${after}"/>${indent?`<w:ind w:left="${indent}"/>`:''}${keepNext?'<w:keepNext/>':''}${keepLines?'<w:keepLines/>':''}${breakBefore?'<w:pageBreakBefore/>':''}${bottomBorder?'<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="7" w:color="C6D8E9"/></w:pBdr>':''}${tabs}</w:pPr>`;
  return `<w:p>${ppr}${parts.map(p=>typeof p==='string'?run(p):p.raw||run(p.text,p)).join('')}</w:p>`;
}
function rels(list) {return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${relNs}">${list.map(([id,type,target])=>`<Relationship Id="${id}" Type="${relBase}${type}" Target="${target}"/>`).join('')}</Relationships>`;}
function field(name) {return `<w:fldSimple w:instr="${name}"><w:r><w:rPr>${color('66778F')}<w:sz w:val="17"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>`;}
function logoDrawing(relationId, logo, docPrId=1, maxInches=.45) {
  // Allow tiny 16px (1/6in) through 72px (3/4in); preserve aspect ratio.
  maxInches=Math.max(16/96,Math.min(.75,maxInches));
  const cx=Math.round(Math.min(maxInches,maxInches*(logo.width/logo.height))*914400);
  const cy=Math.round(Math.min(maxInches,maxInches*(logo.height/logo.width))*914400);
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="Institution logo" descr="Uploaded institution logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Institution logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}
function tableCell(content, width, shade='FFFFFF') {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:fill="${shade}"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="95" w:type="dxa"/><w:left w:w="130" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${content||paragraph([''])}</w:tc>`;
}
function table(rows,widths) {
  const width=widths.reduce((a,b)=>a+b,0);
  return `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="DCE7F3"/><w:bottom w:val="single" w:sz="4" w:color="DCE7F3"/><w:insideH w:val="single" w:sz="3" w:color="E6EDF6"/><w:insideV w:val="single" w:sz="3" w:color="E6EDF6"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map(row=>`<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.map((cell,i)=>tableCell(cell,widths[i],i%2===0?'F6F9FD':'FFFFFF')).join('')}</w:tr>`).join('')}</w:tbl>`;
}
function sectionHeading(name,count){return paragraph([{text:name.toUpperCase(),bold:true,color:'204F86',size:22},{text:`  ·  ${count} ${count===1?'question':'questions'}`,color:'6B7F99',size:17}],{before:230,after:160,keepNext:true,bottomBorder:true});}
function longAnswer(item, settings, {questionStem=true}={}) {
  const {q,number}=item;
  const lines=answerItems(q.answer,q.type);
  let content=paragraph([{text:`${number}.  `,bold:true,color:'1F4E88'},{text:questionStem?q.text:displayAnswer(q),bold:!questionStem}],{before:95,after:75,keepNext:true,keepLines:true});
  if (questionStem) {
    if(!lines.length) content+=paragraph([{text:'No answer supplied',italic:true,color:'7A8798'}],{indent:330,after:150});
    else if(q.type==='enumeration') {
      lines.forEach((line,i)=>content+=paragraph([{text:`${i+1}. `,bold:true,color:'5077A0'},{text:line}],{indent:380,after:48,keepLines:true}));
      content+=paragraph([''],{after:100});
    } else {
      lines.forEach((line,i)=>content+=paragraph([line],{indent:330,after:i===lines.length-1?165:30,keepLines:true}));
    }
  }
  if(settings.includeExplanations && q.explanation?.trim()) {
    content+=paragraph([{text:'Explanation  ',bold:true,color:'496D97'},{text:q.explanation,color:'4B5F78'}],{indent:330,after:170,keepLines:true});
  }
  return content;
}
function answerKey(questions,settings,usableWidth,{newPage=true}={}) {
  let x=paragraph([{text:'ANSWER KEY',bold:true,color:'173B63',size:32}],{breakBefore:newPage,after:50,align:'center',keepNext:true});
  x+=paragraph([{text:`${questions.length} questions · ${settings.title||'Assessment'}`,color:'61758E',size:18}],{align:'center',after:170});
  if(settings.answerKeyLayout==='sequential') {
    questions.forEach(item=>{});
    questions.forEach((q,index)=>{
      if(q.type==='enumeration'||q.type==='essay') x+=longAnswer({q,number:index+1},settings);
      else {
        x+=paragraph([{text:`${index+1}.  `,bold:true,color:'204F86'},{text:displayAnswer(q),bold:q.type==='multiple_choice',color:'203044'}],{after:settings.includeExplanations?45:105,keepLines:true});
        if(settings.includeExplanations&&q.explanation?.trim())x+=paragraph([{text:'Explanation: ',bold:true},{text:q.explanation}],{indent:320,after:135,keepLines:true});
      }
    });
    return x;
  }
  for(const group of answerGroups(questions)) {
    x+=sectionHeading(group.label,group.rows.length);
    if(group.type==='multiple_choice'||group.type==='true_false') {
      if(settings.includeExplanations) group.rows.forEach(item=>{
        x+=paragraph([{text:`${item.number}.  `,bold:true,color:'204F86'},{text:displayAnswer(item.q),bold:true,color:'142E4C'}],{after:45,keepLines:true});
        if(item.q.explanation?.trim())x+=paragraph([{text:'Explanation: ',bold:true,color:'4F729A'},{text:item.q.explanation,color:'44566D'}],{indent:340,after:135,keepLines:true});
      });
      else {
        const cols=3, columnWidths=[Math.floor(usableWidth/3),Math.floor(usableWidth/3),usableWidth-2*Math.floor(usableWidth/3)];
        const rows=[];
        for(let i=0;i<group.rows.length;i+=cols)rows.push(Array.from({length:cols},(_,j)=>{
          const item=group.rows[i+j];return item?paragraph([{text:`${String(item.number).padStart(2,'0')}  `,bold:true,color:'5D7EA6'},{text:displayAnswer(item.q),bold:true,color:'17395F'}],{after:0}):paragraph([''],{after:0});
        }));
        x+=table(rows,columnWidths);
        x+=paragraph([''],{after:115});
      }
    } else if(group.type==='identification') {
      group.rows.forEach(item=>{
        x+=paragraph([{text:`${item.number}.  `,bold:true,color:'204F86'},{text:displayAnswer(item.q),color:'223248'}],{after:settings.includeExplanations?40:105,keepLines:true});
        if(settings.includeExplanations&&item.q.explanation?.trim())x+=paragraph([{text:'Explanation: ',bold:true},{text:item.q.explanation}],{indent:340,after:120,keepLines:true});
      });
    } else group.rows.forEach(item=>x+=longAnswer(item,settings));
  }
  return x;
}
function introBody(settings,logo) {
  let x='';
  if(logo && settings.logoPlacement==='title')x+=paragraph([{raw:logoDrawing('rIdLogo',logo,3,logoSizePx(settings)/96)}],{align:'center',after:140});
  if(showSchoolInTitle(settings))x+=paragraph([{text:settings.school.trim(),bold:true,color:'18385A'}],{align:'center',after:70});
  x+=paragraph([{text:settings.title||'Practice Assessment',bold:true}],{align:'center',style:'Title',after:70});
  if(settings.subtitle?.trim())x+=paragraph([{text:settings.subtitle,color:'6C7B91'}],{align:'center',after:75});
  if(settings.subject?.trim())x+=paragraph([{text:'Subject: ',bold:true},{text:settings.subject}],{after:105});
  if(settings.showStudentFields){
    x+=paragraph(['Name: ___________________________________    Section: ____________________'],{after:75});
    x+=paragraph(['Date: _______________________    Score: ____________________'],{after:140});
  }
  if(settings.instructions?.trim())x+=paragraph([{text:'Instructions: ',bold:true},{text:settings.instructions}],{after:180});
  return x;
}
function questionsBody(questions,settings) {
  let x='';
  let previousType='';
  questions.forEach((q,index)=>{
    if(q.type!==previousType){x+=sectionHeading(TYPE_LABELS[q.type]||'Questions',questions.filter(item=>item.type===q.type).length);previousType=q.type;}
    x+=paragraph([{text:`${index+1}. `,bold:true},{text:q.text},...(settings.showPoints?[{text:`  (${Number(q.points)||1} ${Number(q.points)===1?'point':'points'})`,color:'66788A',size:18}]:[])],{after:85,keepNext:true,keepLines:true});
    if(q.type==='multiple_choice'){
      (q.options||[]).filter(o=>o.text?.trim()).forEach((o,j,arr)=>x+=paragraph([{text:`${o.label}.  `,bold:true,color:'315A88'},{text:o.text}],{indent:380,after:j===arr.length-1?170:45,keepLines:true}));
    } else if(q.type==='true_false')x+=paragraph(['☐ True                     ☐ False'],{indent:420,after:180});
    else if(q.type==='identification')x+=paragraph([settings.pageColumns==2?'Answer: __________________________':'Answer: ______________________________________________'],{after:175});
    else if(q.type==='enumeration'){
      for(let k=1;k<=Math.min(20,Math.max(1,Number(q.expectedCount)||3));k++)x+=paragraph([`${k}) ${Number(settings.pageColumns)===2?'________________________':'______________________________________________'}`],{indent:330,after:65});
      if(index < questions.length-1) x+=paragraph([''],{after:90});
    }else{
      for(let k=0;k<Math.min(12,Math.max(2,Number(settings.answerLines)||4));k++)x+=paragraph([Number(settings.pageColumns)===2?'___________________________________':'____________________________________________________________'],{after:145});
      if(index < questions.length-1) x+=paragraph([''],{after:85});
    }
  });
  return x;
}

function headerXML(settings,logo,usableWidth,layout){
  const left=resolveDocumentText(settings.headerLeft,settings).trim();
  const center=resolveDocumentText(settings.headerCenter,settings).trim();
  const right=resolveDocumentText(settings.headerRight,settings).trim();
  const widths=[Math.round(usableWidth*.23),Math.round(usableWidth*.54),usableWidth-Math.round(usableWidth*.23)-Math.round(usableWidth*.54)];
  const logoPart=logo&&settings.logoPlacement!=='title'?`<w:r>${logoDrawing('rIdLogo',logo,1,Math.min(logoSizePx(settings)/96,Math.max(16/96,(layout.mm.top-4.5)/25.4)))}</w:r>`:'';
  const hCell=(content,width,align)=>`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:left w:w="30" w:type="dxa"/><w:right w:w="30" w:type="dxa"/></w:tcMar></w:tcPr>${paragraph([{raw:content}],{after:0,align})}</w:tc>`;
  const format=(value,{bold=false}={})=>value?run(value,{bold,color:'535D6A',size:17}):'';
  const leftContent=`${logoPart}${logoPart&&left?run('  '):''}${format(left,{bold:true})}`;
  const cells=[hCell(leftContent,widths[0],'left'),hCell(format(center,{bold:true}),widths[1],'center'),hCell(format(right),widths[2],'right')].join('');
  const table=`<w:tbl><w:tblPr><w:tblW w:w="${usableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="D6DEE5"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${DOC_NS}>${table}<w:p/></w:hdr>`;
}
function footerXML(settings,usableWidth){
  const left=resolveDocumentText(settings.footerLeft,settings).trim();
  const center=resolveDocumentText(settings.footerCenter,settings).trim();
  const right=resolveDocumentText(settings.footerRight,settings).trim();
  const midPos=Math.round(usableWidth/2);
  const rightContent=`${right?run(right,{color:'667B94',size:17}):''}${right&&settings.showPageNumbers?run('  ·  ',{color:'667B94',size:17}):''}${settings.showPageNumbers?`${run('Page ',{color:'667B94',size:17})}${field('PAGE')}${run(' of ',{color:'667B94',size:17})}${field('NUMPAGES')}`:''}`;
  const ppr=`<w:pPr><w:spacing w:before="70" w:after="0"/><w:pBdr><w:top w:val="single" w:sz="5" w:space="6" w:color="D8E3EE"/></w:pBdr><w:tabs><w:tab w:val="center" w:pos="${midPos}"/><w:tab w:val="right" w:pos="${usableWidth}"/></w:tabs></w:pPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${DOC_NS}><w:p>${ppr}${run(left,{color:'667B94',size:17})}<w:r><w:tab/></w:r>${run(center,{color:'667B94',size:17})}<w:r><w:tab/></w:r>${rightContent}</w:p></w:ftr>`;
}
function pageDimensions(paper){return paper==='Letter'?[12240,15840]:paper==='Legal'?[12240,20160]:[11906,16838];}
function base64Bytes(base64){return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}

function sectionXML({w,h,layout,hasHeader,hasFooter,columns=1,type=''}) {
  const refs=`${hasHeader?'<w:headerReference w:type="default" r:id="rIdHeader"/>':''}${hasFooter?'<w:footerReference w:type="default" r:id="rIdFooter"/>':''}`;
  const m=layout.twips;
  const breaks=type?`<w:type w:val="${type}"/>`:'';
  return `<w:sectPr>${refs}${breaks}<w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="${m.top}" w:right="${m.right}" w:bottom="${m.bottom}" w:left="${m.left}" w:header="250" w:footer="250" w:gutter="0"/><w:cols w:num="${columns}" w:space="420"/></w:sectPr>`;
}
function sectionBreak(xml) {return `<w:p><w:pPr>${xml}</w:pPr></w:p>`;}
export function buildDocxBlob(questions,settings){
  if(!questions.length)throw new Error('Add at least one question first.');
  const layout=pageLayout(settings);
  const [w,h]=pageDimensions(settings.paper),usableWidth=w-layout.twips.left-layout.twips.right;
  const logo=cleanLogo(settings);
  const hasHeader=Boolean((logo&&settings.logoPlacement!=='title')||settings.headerLeft?.trim()||settings.headerCenter?.trim()||settings.headerRight?.trim());
  const hasFooter=Boolean(settings.showPageNumbers||settings.footerLeft?.trim()||settings.footerCenter?.trim()||settings.footerRight?.trim());
  const sect=(cols,type='')=>sectionXML({w,h,layout,hasHeader,hasFooter,columns:cols,type});
  let content;
  if(layout.columns===2){
    // Preserve full-width assessment metadata and answer key; only the questions flow in columns.
    content=introBody(settings,logo)+sectionBreak(sect(1))+questionsBody(questions,settings);
    if(settings.includeAnswerKey)content+=sectionBreak(sect(2,'continuous'))+answerKey(questions,settings,usableWidth,{newPage:false});
  }else{
    content=introBody(settings,logo)+questionsBody(questions,settings);
    if(settings.includeAnswerKey)content+=answerKey(questions,settings,usableWidth);
  }
  content+=sect(layout.columns===2&&settings.includeAnswerKey?1:layout.columns,layout.columns===2&&settings.includeAnswerKey?'nextPage':layout.columns===2?'continuous':'');
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${DOC_NS}><w:body>${content}</w:body></w:document>`;
  const font=esc(settings.font||'Arial');
  const fontSize=Math.max(9,Math.min(16,Number(settings.fontSize)||11))*2;
  const line=settings.spacing==='compact'?240:settings.spacing==='relaxed'?360:295;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:sz w:val="${fontSize}"/>${color('223044')}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="33"/>${color('173C68')}</w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/>${color('205387')}</w:rPr></w:style></w:styles>`;
  const extras={};
  const mainRels=[['rIdStyles','styles','styles.xml']];
  if(hasHeader){extras['word/header1.xml']=headerXML(settings,logo,usableWidth,layout);mainRels.push(['rIdHeader','header','header1.xml']);}
  if(hasFooter){extras['word/footer1.xml']=footerXML(settings,usableWidth);mainRels.push(['rIdFooter','footer','footer1.xml']);}
  if(logo){
    const ext=logo.mime==='image/png'?'png':'jpg';
    extras[`word/media/logo.${ext}`]=base64Bytes(logo.base64);
    if(settings.logoPlacement==='title')mainRels.push(['rIdLogo','image',`media/logo.${ext}`]);
    else extras['word/_rels/header1.xml.rels']=rels([['rIdLogo','image',`media/logo.${ext}`]]);
  }
  const imageContent=logo?`<Default Extension="${logo.mime==='image/png'?'png':'jpg'}" ContentType="${logo.mime}"/>`:'';
  return createZip({
    '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageContent}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${hasHeader?'<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>':''}${hasFooter?'<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>':''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${relBase}officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${relBase}extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'word/_rels/document.xml.rels':rels(mainRels),
    'word/document.xml':doc, 'word/styles.xml':styles,
    'docProps/core.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(settings.title||'QuestionForge Assessment')}</dc:title><dc:creator>QuestionForge</dc:creator></cp:coreProperties>`,
    'docProps/app.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>QuestionForge</Application></Properties>`,
    ...extras,
  });
}
