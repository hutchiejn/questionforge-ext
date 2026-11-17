import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFile,mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {minify} from 'html-minifier-terser';

const root=fileURLToPath(new URL('../',import.meta.url));
const python=process.platform==='win32'?'python':'python3';
const json=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));

export async function buildRelease(requested){
  const manifest=await json('manifest.json'),pkg=await json('package.json'),lock=await json('package-lock.json');
  const version=requested??manifest.version;
  assert.match(version,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,'Use a version such as 0.8.3, without a v prefix.');
  assert.ok(version.split('.').every(n=>Number(n)<=65535)&&version!=='0.0.0','Version must be valid for Chrome.');
  assert.ok([manifest.version,pkg.version,lock.version,lock.packages[''].version].every(value=>value===version),'Requested version must match manifest.json, package.json, and package-lock.json. Update and commit them before releasing.');
  const staging=await mkdtemp(path.join(tmpdir(),'questionforge-build-'));
  try{
    await build({entryPoints:{app:path.join(root,'app.js'),background:path.join(root,'background.js'),styles:path.join(root,'styles.css'),'docs/legal':path.join(root,'docs/legal.css')},outdir:staging,bundle:true,format:'esm',platform:'browser',target:`chrome${manifest.minimum_chrome_version}`,minify:true,sourcemap:false,legalComments:'none',charset:'utf8'});
    await writeFile(path.join(staging,'manifest.json'),JSON.stringify(manifest));
    const files=['manifest.json','app.js','background.js','styles.css','docs/legal.css'];
    const assets=[...new Set(Object.values(manifest.icons)),'assets/brand-mark-dark.svg','assets/brand-mark-light.svg','assets/brand-wordmark-dark.svg','assets/brand-wordmark-light.svg','assets/gcash-receive-qr.png','assets/gcash-receive-qr.sha256','assets/gcash-receive-card.png','assets/gcash-receive-card.sha256','docs/brand-mark.svg'];
    for(const file of assets){
      assert.ok(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'),'Asset paths must stay inside the extension.');
      await mkdir(path.dirname(path.join(staging,file)),{recursive:true});
      await copyFile(path.join(root,file),path.join(staging,file));files.push(file);
    }
    for(const file of ['sidepanel.html','docs/index.html','docs/privacy.html','docs/contact.html']){
      const html=await minify(await readFile(path.join(root,file),'utf8'),{collapseWhitespace:true,conservativeCollapse:true,removeComments:true,removeRedundantAttributes:true,minifyCSS:true,keepClosingSlash:true});
      await writeFile(path.join(staging,file),html);files.push(file);
    }
    await mkdir(path.join(root,'dist'),{recursive:true});
    const archive=path.join(root,'dist',`QuestionForge-v${version}.zip`);
    // Python's standard library provides ZIP compression and HTML reference checks.
    const report=execFileSync(python,['-c',`
import hashlib,json,sys,zipfile
from html.parser import HTMLParser
from pathlib import Path
root=Path(sys.argv[1]);output=Path(sys.argv[2]);files=sorted(json.load(sys.stdin))
assert len(files)==len(set(files))
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
for name in [manifest['background']['service_worker'],manifest['side_panel']['default_path'],*manifest['icons'].values()]:
    assert name in files,name
class Links(HTMLParser):
    def __init__(self):super().__init__();self.refs=[]
    def handle_starttag(self,tag,attrs):
        self.refs.extend(value for key,value in attrs if key in ['src','href'] and value and not value.startswith(('https:','http:','mailto:','#','data:')))
for name in files:
    file=root/name
    if file.suffix=='.html':
        parser=Links();parser.feed(file.read_text(encoding='utf-8'))
        for ref in parser.refs:assert (file.parent/ref).resolve().relative_to(root).as_posix() in files,(name,ref)
for stem in ['gcash-receive-qr','gcash-receive-card']:
    assert hashlib.sha256((root/'assets'/f'{stem}.png').read_bytes()).hexdigest()==(root/'assets'/f'{stem}.sha256').read_text(encoding='utf-8').strip()
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for name in files:
        info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
        archive.writestr(info,(root/name).read_bytes(),compresslevel=9)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert archive.namelist()==files
print(json.dumps({'file':str(output),'version':manifest['version'],'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))
`,staging,archive],{input:JSON.stringify(files),encoding:'utf8'});
    return JSON.parse(report);
  }finally{
    assert.equal(path.dirname(path.resolve(staging)),path.resolve(tmpdir()));
    await rm(staging,{recursive:true,force:true});
  }
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  console.log(JSON.stringify(await buildRelease(process.argv[2]),null,2));
}
