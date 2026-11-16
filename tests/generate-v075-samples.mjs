import {readFileSync,writeFileSync} from 'node:fs';
import {parseQuestions} from '../lib/parser.js';
import {DEFAULT_SETTINGS} from '../lib/model.js';
import {buildDocxBlob} from '../lib/docx-export.js';
import {renderPaper} from '../lib/print-export.js';
const qs=parseQuestions(readFileSync(new URL('./fixtures/volcanoes-one-line.txt',import.meta.url),'utf8')).questions;
const pic=readFileSync(new URL('../examples/demo_institution_logo.png',import.meta.url));
const brandLogo={name:'Sample school emblem',mime:'image/png',data:`data:image/png;base64,${pic.toString('base64')}`,width:256,height:256};
const settings={...DEFAULT_SETTINGS,title:'Earth Science Practice Assessment',school:'Sample Academy',subject:'Science',subtitle:'Quarter 1 · Review',
  headerLeft:'',headerCenter:'Sample Academy · Science Department',headerRight:'',
  brandLogo,logoSizePx:32,logoPlacement:'header',avoidDuplicateSchool:true,
  margins:'narrow',pageColumns:2,showPoints:true,answerLines:4,showPageNumbers:true,
  footerLeft:'For classroom use',footerCenter:'{title}',footerRight:'{date}'};
for(const [suffix,opts] of [['TwoColumns_Narrow',settings],['OneColumn_Normal',{...settings,pageColumns:1,margins:'normal',headerCenter:'Sample Academy · Science Department'}]]){
const prefix=`/mnt/data/QuestionForge_v0.7.5/QuestionForge_${suffix}`;
writeFileSync(prefix+'.docx',Buffer.from(await buildDocxBlob(qs,opts).arrayBuffer()));
const {markup,css}=renderPaper(qs,opts);
writeFileSync(prefix+'.html',`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${markup}</body></html>`);
}
console.log('Generated assessment samples',qs.length);
