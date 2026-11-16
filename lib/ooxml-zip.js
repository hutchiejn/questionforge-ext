/** Small local Office ZIP reader with decompression bounds. */
const utf8=new TextDecoder('utf-8');
const MAX_ZIP_FILE_BYTES=8*1024*1024,MAX_XML_BYTES=10*1024*1024;
const MAX_TOTAL_BYTES=24*1024*1024,MAX_COMPRESSION_RATIO=250;
/** Read a compressed entry without allocating an unbounded intermediate buffer. */
export async function inflateBounded(input,codec,expected,maxBytes=MAX_XML_BYTES){
  if(!Number.isSafeInteger(expected)||expected<0||expected>maxBytes)throw Error('Compressed document entry is too large.');
  const reader=new Blob([input]).stream().pipeThrough(new DecompressionStream(codec)).getReader();
  const chunks=[];let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;
      if(total>maxBytes||total>expected)throw Error('Decompression safety limit exceeded; document rejected.');
      chunks.push(value);
    }
  }catch(error){try{await reader.cancel();}catch{} throw error;}
  if(total!==expected)throw Error('Decompression size mismatch.');
  const output=new Uint8Array(total);let cursor=0;
  for(const chunk of chunks){output.set(chunk,cursor);cursor+=chunk.length;}
  return output;
}

const u16=(v,i)=>v.getUint16(i,true),u32=(v,i)=>v.getUint32(i,true);
/** Read only requested ZIP entries, using the central directory and native deflate-raw. */
export async function readZipEntries(buffer,wanted){
  const bytes=new Uint8Array(buffer),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.byteLength>MAX_ZIP_FILE_BYTES)throw Error('Document exceeds the 8 MB safe import limit.');
  if(bytes.byteLength<22)throw Error('DOCX is not a valid ZIP-based document container.');
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(v.getUint32(i,true)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw Error('DOCX is not a valid ZIP-based document.');
  const count=u16(v,eocd+10),start=u32(v,eocd+16),out={};
  if(start<0||start>bytes.length)throw Error('Invalid ZIP directory offset.');
  let selectedTotal=0;
  if(count>20000)throw Error('Document contains too many ZIP entries.');
  let pos=start;
  for(let k=0;k<count;k++){
    if(pos+46>bytes.length||u32(v,pos)!==0x02014b50)throw Error('Invalid DOCX central directory.');
    const method=u16(v,pos+10),compressed=u32(v,pos+20),uncompressed=u32(v,pos+24),fileLen=u16(v,pos+28),extraLen=u16(v,pos+30),commentLen=u16(v,pos+32),loc=u32(v,pos+42);
    if(pos+46+fileLen+extraLen+commentLen>bytes.length)throw Error('Invalid ZIP directory entry length.');
    const name=utf8.decode(bytes.subarray(pos+46,pos+46+fileLen));pos+=46+fileLen+extraLen+commentLen;
    if(!wanted.has(name))continue;
    if(uncompressed>MAX_XML_BYTES)throw Error('Document XML is too large to inspect safely.');
    selectedTotal+=uncompressed;if(selectedTotal>MAX_TOTAL_BYTES)throw Error('Total document XML exceeds the extraction limit.');
    if(compressed>0&&uncompressed>1024*1024&&uncompressed/compressed>MAX_COMPRESSION_RATIO)
      throw Error('Suspicious compression ratio; please use a smaller or uncompressed source.');
    if(loc+30>bytes.length||u32(v,loc)!==0x04034b50)throw Error('DOCX entry header is invalid.');
    const offset=loc+30+u16(v,loc+26)+u16(v,loc+28),end=offset+compressed;
    if(end>bytes.length)throw Error('DOCX entry is truncated.');
    const input=bytes.subarray(offset,end);let output;
    if(method===0)output=new Uint8Array(input);
    else if(method===8){
      output=await inflateBounded(input,'deflate-raw',uncompressed);
    }else throw Error('Unsupported DOCX compression method.');
    if(output.length!==uncompressed)throw Error('DOCX decompression size mismatch.');
    out[name]=utf8.decode(output);
  }
  return out;
}
