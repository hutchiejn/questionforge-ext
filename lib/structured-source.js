/**
 * QuestionForge source JSON v1. A single lossless-as-extracted review document.
 * Sources remain untrusted data. Review/approval is deliberately NOT importable
 * from edited JSON: only the user can approve after applying changes.
 */
export const SOURCE_SCHEMA='questionforge.source.v1';
const MAX_REVIEW_BLOCKS=900, MAX_REVIEW_CELLS=50000;
const str=(v,field)=>{if(typeof v!=='string')throw new Error(`${field} must be text.`);if(v.length>50000)throw new Error(`${field} exceeds the review text limit.`);return v;};

export function structuredSource(source,{selectedOnly=false}={}){
  const blocks=(source.blocks||[]).filter(b=>!selectedOnly||b.selected!==false);
  const content=[];let table=null;
  for(const b of blocks){
    if(b.kind==='table-row'&&b.tableId){
      if(!table||table.id!==b.tableId){
        table={type:'table',id:b.tableId,sourceRef:b.tableRef||b.tableId,rows:[],warnings:[]};
        content.push(table);
      }
      table.rows.push({ref:b.ref,rowNumber:b.rowNumber??null,selected:b.selected!==false,cells:(b.cells||[]).map(c=>({
        ref:c.ref||'',column:c.column||'',value:String(c.text??''),
        ...(c.colSpan>1?{colSpan:c.colSpan}:{}),...(c.rowSpan>1?{rowSpan:c.rowSpan}:{}),
        ...(c.mergedRange?{mergedRange:c.mergedRange}:{}),
        ...(c.formula?{formula:c.formula}:{}),...(c.rawValue!==undefined?{rawValue:c.rawValue}:{}),
        ...(c.type?{valueType:c.type}:{}),...(c.flags?.length?{warnings:c.flags}:{}),
      }))});
      for(const warning of b.flags||[])if(!table.warnings.includes(warning))table.warnings.push(warning);
    }else{
      table=null;
      content.push({type:b.kind||'paragraph',ref:b.ref,text:String(b.text??''),selected:b.selected!==false,
        ...(b.flags?.length?{warnings:b.flags}:{}),...(b.page?{page:b.page}:{})});
    }
  }
  return {
    schema:SOURCE_SCHEMA,
    source:{filename:source.name||'unknown',format:source.kind||'text',sha256:source.hash||null,
      ...(source.expectedPages?{expectedPages:source.expectedPages}:{})},
    review:{teacherApproved:Boolean(source.approved),selection:selectedOnly?'approved-selection':'full-extraction',warnings:source.warnings||[],hasCriticalError:Boolean(source.hasCriticalError)},
    content,
  };
}
export function countSourceStructure(source){
  const obj=structuredSource(source);return {tables:obj.content.filter(b=>b.type==='table').length,rows:obj.content.filter(b=>b.type==='table').reduce((n,t)=>n+t.rows.length,0),textBlocks:obj.content.filter(b=>b.type!=='table').length};
}

/**
 * Validate and apply an edited full JSON document, preserving source identity,
 * references, table boundaries, worksheet coordinates, and selection flags.
 * Never silently discard blocks or accept tampered provenance/approval fields.
 * Return a new source object; on failure the original remains untouched.
 */
export function applyStructuredSource(source,input){
  if(typeof input==='string'&&input.length>8_000_000)throw Error('Edited JSON exceeds the 8 MB review limit.');
  const data=typeof input==='string'?JSON.parse(input):input;
  if(!data||typeof data!=='object'||Array.isArray(data)||data.schema!==SOURCE_SCHEMA)throw new Error('Expected a QuestionForge source JSON object (questionforge.source.v1).');
  if(data.source?.sha256!==source.hash||data.source?.filename!==source.name||data.source?.format!==source.kind)throw new Error('Source filename, format, or SHA-256 changed. Re-import the original file instead.');
  if(!Array.isArray(data.content)||!data.content.length)throw new Error('The JSON must contain at least one content block.');
  const blocks=[];let cellCount=0;
  for(const entry of data.content){
    if(!entry||typeof entry!=='object')throw new Error('Every content entry must be an object.');
    if(entry.type==='table'){
      const id=str(entry.id,'Table ID');
      if(!id||!Array.isArray(entry.rows)||!entry.rows.length)throw new Error('Each table needs an ID and at least one row.');
      for(const row of entry.rows){
        if(!row||!Array.isArray(row.cells)||!row.cells.length)throw new Error(`${id} contains a row without cells.`);
        cellCount+=row.cells.length;if(cellCount>MAX_REVIEW_CELLS)throw new Error('Too many table cells in the JSON.');
        const cells=row.cells.map((cell,i)=>({
          ref:str(cell.ref,`Cell ${i+1} reference`),column:str(cell.column,`Cell ${i+1} column`),
          text:str(cell.value,`Cell ${cell.ref||i+1} value`),type:cell.valueType||'text',
          ...(Number.isInteger(cell.colSpan)&&cell.colSpan>1?{colSpan:cell.colSpan}:{}),
          ...(Number.isInteger(cell.rowSpan)&&cell.rowSpan>1?{rowSpan:cell.rowSpan}:{}),
          ...(cell.mergedRange?{mergedRange:str(cell.mergedRange,'Merged range')}:{}),
          ...(cell.formula?{formula:str(cell.formula,'Formula')}:{}),
          ...(cell.rawValue!==undefined?{rawValue:cell.rawValue}:{}),
          flags:Array.isArray(cell.warnings)?cell.warnings.map(String):[],
        }));
        const flags=Array.isArray(entry.warnings)?entry.warnings.map(String):[];
        blocks.push({kind:'table-row',tableId:id,tableRef:entry.sourceRef||id,ref:str(row.ref,'Row reference'),
          rowNumber:row.rowNumber??null,selected:row.selected!==false,cells,
          text:cells.map(c=>`${c.column}: ${c.text}`).join(' | '),flags});
      }
    }else{
      if(!['paragraph','text','pdf-page'].includes(entry.type))throw new Error(`Unsupported content type: ${String(entry.type)}`);
      const ref=str(entry.ref,'Block reference'); const text=str(entry.text,`Text at ${ref}`);
      if(!ref)throw new Error('Every content block needs a source reference.');
      blocks.push({kind:entry.type,ref,text,selected:entry.selected!==false,
        flags:Array.isArray(entry.warnings)?entry.warnings.map(String):[],
        ...(Number.isInteger(entry.page)&&entry.page>0?{page:entry.page}:{})});
    }
    if(blocks.length>MAX_REVIEW_BLOCKS)throw new Error('Too many content blocks. No source content has been replaced.');
  }
  // Treat teacherApproved in imported JSON as untrusted. Only the check-box can set it.
  return {...source,blocks,approved:false};
}
