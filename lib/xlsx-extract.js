/** A deliberately limited, dependency-free XLSX reader for BOW/TOS worksheets.
 * Preserves raw values, source cell references, merged ranges and formula text.
 * It does not calculate formulas, resolve formatting, or infer table meaning.
 */
import {readZipEntries} from './ooxml-zip.js';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function children(n,name){return Array.from(n?.childNodes||[]).filter(c=>c.nodeType===1&&(!name||c.localName===name));}
function descendants(n,name){return Array.from(n?.getElementsByTagNameNS(NS,name)||[]);}
function nodeText(n,tag){return descendants(n,tag)[0]?.textContent||'';}
function parseXml(str,file){
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(str))throw Error(`Unsupported DTD/entity declarations in ${file}.`);
  const xml=new DOMParser().parseFromString(str,'application/xml');
  if(xml.getElementsByTagName('parsererror').length)throw Error(`Cannot parse XLSX ${file}.`);
  return xml;
}
function colIdx(label){return [...label].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1;}
function column(i){let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;}
function interpretCell(c,shared,warnings,sheetName){
  const ref=c.getAttribute('r')||'';const type=c.getAttribute('t')||'';
  const raw=nodeText(c,'v');const formula=nodeText(c,'f');let value=raw;
  if(type==='s'){
    const idx=Number(raw);if(!Number.isInteger(idx)||idx<0||idx>=shared.length){warnings.push(`${sheetName}!${ref}: missing shared string entry.`);value='[shared string unavailable]';}
    else value=shared[idx];
  }else if(type==='inlineStr')value=descendants(c,'is')[0]?.textContent||'';
  else if(type==='b')value=raw==='1'?'TRUE':'FALSE';
  else if(type==='e')warnings.push(`${sheetName}!${ref}: Excel formula/error cell needs review (${raw}).`);
  if(formula&&!raw)warnings.push(`${sheetName}!${ref}: formula has no cached value; QuestionForge cannot calculate it.`);
  return {ref,column:(ref.match(/^[A-Z]+/)||[])[0]||'',text:String(value),type:type||'number',
    ...(formula?{formula}:{}),rawValue:raw,
    ...(!raw&&formula?{flags:['Formula result was not saved in workbook; open in Excel/LibreOffice, recalculate and save.']}:{}),
  };
}
function normalizePath(path){
  const parts=[];for(const p of path.replace(/^\//,'').split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p);}
  return parts.join('/');
}
export async function extractXlsx(buffer){
  if(typeof DOMParser==='undefined')throw Error('XLSX extraction requires a browser XML parser.');
  const base=await readZipEntries(buffer,new Set(['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/sharedStrings.xml','xl/styles.xml']));
  if(!base['xl/workbook.xml'])throw Error('XLSX workbook XML was not found.');
  const wb=parseXml(base['xl/workbook.xml'],'workbook.xml');
  const relxml=base['xl/_rels/workbook.xml.rels']?parseXml(base['xl/_rels/workbook.xml.rels'],'workbook.rels'):null;
  const relationships=new Map();
  for(const r of Array.from(relxml?.getElementsByTagName('*')||[]).filter(n=>n.localName==='Relationship')){
    const id=r.getAttribute('Id'),target=r.getAttribute('Target');
    if(id&&target&& !/^https?:/i.test(target))relationships.set(id,normalizePath(target.startsWith('/')?target:'xl/'+target));
  }
  const sheets=descendants(wb,'sheet').map((s,i)=>({
    name:s.getAttribute('name')||`Sheet ${i+1}`,
    rid:s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),
    fallback:`xl/worksheets/sheet${i+1}.xml`
  }));
  if(sheets.length>60)throw Error('Too many sheets; split your workbook into smaller files.');
  const paths=sheets.map(s=>relationships.get(s.rid)||s.fallback);
  const zip=await readZipEntries(buffer,new Set(paths));
  const warnings=[];
  const shared=[];
  if(base['xl/sharedStrings.xml']){
    const strings=parseXml(base['xl/sharedStrings.xml'],'sharedStrings.xml');
    for(const si of descendants(strings,'si'))shared.push(descendants(si,'t').map(n=>n.textContent).join(''));
  }
  const blocks=[];let totalTables=0,nonemptySheets=0;
  for(let sn=0;sn<sheets.length;sn++){
    const sheet=sheets[sn],path=paths[sn],xml=zip[path];
    if(!xml){warnings.push(`${sheet.name}: sheet XML not found (${path}).`);continue;}
    const dom=parseXml(xml,path);const mergeRefs=descendants(dom,'mergeCell').map(x=>x.getAttribute('ref')).filter(Boolean);
    const mergedAnchors=new Map();
    for(const range of mergeRefs){
      const [a,b]=range.split(':');if(!b)continue;
      const startCol=colIdx(a.match(/^[A-Z]+/)?.[0]||'A');const endCol=colIdx(b.match(/^[A-Z]+/)?.[0]||'A');
      const startRow=Number(a.match(/\d+/)?.[0]||1),endRow=Number(b.match(/\d+/)?.[0]||1);
      mergedAnchors.set(a,{mergedRange:range,colSpan:Math.max(1,endCol-startCol+1),rowSpan:Math.max(1,endRow-startRow+1)});
    }
    const rows=descendants(dom,'sheetData')[0];if(!rows){warnings.push(`${sheet.name}: empty sheet data.`);continue;}
    let region=0,inside=false,previousRow=0,seen=false;
    for(const row of children(rows,'row')){
      const number=Number(row.getAttribute('r')||previousRow+1);
      const cells=children(row,'c').map(c=>interpretCell(c,shared,warnings,sheet.name));
      if(!cells.some(c=>c.text.trim()||c.formula)){inside=false;previousRow=number;continue;}
      if(!inside||number>previousRow+1){inside=true;region++;totalTables++;}
      const ref=`${sheet.name} · row ${number}`,tableId=`${sheet.name} / region ${region}`;
      for(const cell of cells)if(mergedAnchors.has(cell.ref))Object.assign(cell,mergedAnchors.get(cell.ref));
      const flags=[];if(cells.some(c=>c.mergedRange))flags.push('Merged cells — verify original spreadsheet.');
      if(cells.some(c=>c.formula))flags.push('Formula cached values are not recalculated.');
      blocks.push({ref,text:cells.map(c=>`${c.column}: ${c.text}`).join(' | '),kind:'table-row',selected:true,flags,
        tableId,tableRef:`Worksheet ${sheet.name}, contiguous region ${region} (provisional table boundary)`,rowNumber:number,cells});
      previousRow=number;seen=true;
    }
    if(seen)nonemptySheets++;
    if(mergeRefs.length)warnings.push(`${sheet.name}: ${mergeRefs.length} merged range(s); confirm column headers and alignment.`);
  }
  if(blocks.length>900)throw Error('XLSX contains too many rows for one import; split the source. No data was omitted.');
  if(totalTables)warnings.push('Worksheet table regions are separated at blank rows. These boundaries are approximate; verify individual tables against the source.');
  warnings.push('XLSX numbers are raw stored values: date formats, percentages, formulas and hidden sheets/cells require comparison with Excel.');
  if(nonemptySheets!==sheets.length)warnings.push('Some worksheets were empty or could not be read. Review original workbook.');
  return {blocks,warnings,kind:'xlsx',hasCriticalError:!blocks.length||nonemptySheets!==sheets.length,
    sheetNames:sheets.map(s=>s.name),tableRegions:totalTables};
}
