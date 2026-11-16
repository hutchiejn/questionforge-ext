import {readFile,writeFile} from 'node:fs/promises';
import {buildDocxBlob} from '../lib/docx-export.js';
import {DEFAULT_SETTINGS,createDemoQuestions} from '../lib/model.js';
const png=await readFile(new URL('../examples/demo_institution_logo.png',import.meta.url));
const logo={name:'demo_institution_logo.png',mime:'image/png',data:`data:image/png;base64,${png.toString('base64')}`,width:128,height:128};
// Determine actual png dimensions if known from IHDR
logo.width=png.readUInt32BE(16);logo.height=png.readUInt32BE(20);
const settings={...DEFAULT_SETTINGS,title:'Science Practice Assessment',school:'Sample Academy',subject:'Science',subtitle:'QuestionForge Preview',brandLogo:logo,logoSizePx:16,logoPlacement:'header',headerLeft:'{school}',headerRight:'{subject}',footerCenter:'{title}',showPageNumbers:true,answerKeyLayout:'grouped'};
const blob=buildDocxBlob(createDemoQuestions().slice(0,4),settings);
await writeFile(new URL('../examples/QuestionForge_v0.5.0_Tiny_Logo_Sample.docx',import.meta.url),Buffer.from(await blob.arrayBuffer()));
console.log('Sample Word created');
