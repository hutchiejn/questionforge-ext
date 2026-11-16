// Small, dependency-free ZIP writer (STORE method, no compression). DOCX is a ZIP container.
// Supports UTF-8 file names; files in our OOXML packages have ASCII names.
const encoder = new TextEncoder();
function crc32(bytes) {
  let crc=0xFFFFFFFF;
  for(const b of bytes){crc ^= b;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xEDB88320 & -(crc & 1));}
  return (crc ^ 0xFFFFFFFF)>>>0;
}
function dosTime(date){return (date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);}
function dosDate(date){return ((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();}
function header(size){return new Uint8Array(size);}
export function createZip(files){
  const local=[],central=[];let offset=0;
  const date = new Date();
  for(const [name,value] of Object.entries(files)){
    const filename=encoder.encode(name),data=typeof value==='string'?encoder.encode(value):value;
    const crc=crc32(data), length=data.length;
    const lh=header(30+filename.length),v=new DataView(lh.buffer);
    v.setUint32(0,0x04034B50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);
    v.setUint16(8,0,true);v.setUint16(10,dosTime(date),true);v.setUint16(12,dosDate(date),true);
    v.setUint32(14,crc,true);v.setUint32(18,length,true);v.setUint32(22,length,true);
    v.setUint16(26,filename.length,true);lh.set(filename,30);
    const ch=header(46+filename.length),c=new DataView(ch.buffer);
    c.setUint32(0,0x02014B50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);
    c.setUint16(8,0x0800,true);c.setUint16(10,0,true);
    c.setUint16(12,dosTime(date),true);c.setUint16(14,dosDate(date),true);
    c.setUint32(16,crc,true);c.setUint32(20,length,true);c.setUint32(24,length,true);
    c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);ch.set(filename,46);
    local.push(lh,data);central.push(ch);offset+=lh.length+length;
  }
  const cdLength=central.reduce((s,b)=>s+b.length,0);
  const end=header(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054B50,true);e.setUint16(8,Object.keys(files).length,true);
  e.setUint16(10,Object.keys(files).length,true);e.setUint32(12,cdLength,true);e.setUint32(16,offset,true);
  return new Blob([...local,...central,end],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
