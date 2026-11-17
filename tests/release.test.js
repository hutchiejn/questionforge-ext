import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {buildRelease} from '../scripts/build-release.mjs';

test('release rejects invalid or mismatched versions before packaging',async()=>{
  for(const version of ['../escape','v0.8.3','01.2.3','1.2.65536','0.0.0','1.2.3-beta']){
    await assert.rejects(()=>buildRelease(version),/version|Version/);
  }
  const current=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url))).version;
  await assert.rejects(()=>buildRelease(current==='1.0.0'?'2.0.0':'1.0.0'),/must match/);
});

test('release ZIP is reproducible, minified, and contains only the loadable runtime',async()=>{
  const first=await buildRelease(),second=await buildRelease();
  assert.equal(first.sha256,second.sha256);
  assert.equal(first.version,JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url))).version);
  const report=JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c',`
import json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    print(json.dumps({'files':archive.namelist(),'app':len(archive.read('app.js')),'manifest':json.loads(archive.read('manifest.json'))}))
`,first.file],{encoding:'utf8'}));
  assert.equal(report.files.length,22);
  assert.ok(report.files.includes('manifest.json'));
  assert.ok(report.files.includes('docs/privacy.html'));
  assert.ok(report.files.includes('docs/contact.html'));
  assert.ok(report.files.every(name=>/^(manifest\.json|sidepanel\.html|app\.js|background\.js|styles\.css|assets\/[^/]+\.(png|svg|sha256)|docs\/[^/]+\.(html|css|svg))$/.test(name)));
  assert.ok(!report.files.some(name=>/node_modules|tests|examples|previews|screenshots|\.map$|\.md$|\.py$/.test(name)));
  assert.deepEqual(report.manifest.permissions,['sidePanel','contextMenus','storage']);
  assert.equal(report.manifest.name,'QuestionForge — Question Paper Builder');
  const originalBytes=readFileSync(new URL('../app.js',import.meta.url)).length+readdirSync(new URL('../lib/',import.meta.url)).filter(name=>name.endsWith('.js')).reduce((sum,name)=>sum+readFileSync(new URL('../lib/'+name,import.meta.url)).length,0);
  assert.ok(report.app<originalBytes,'Bundled app should be smaller than the original modules.');
});
