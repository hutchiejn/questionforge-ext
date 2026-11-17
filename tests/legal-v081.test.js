import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('About / Privacy / Contact are accessible without extra permissions',()=>{
 const app=read('app.js');
 const manifest=JSON.parse(read('manifest.json'));
 assert.equal(manifest.version,JSON.parse(read('package.json')).version);
 assert.deepEqual(manifest.permissions,['sidePanel','contextMenus','storage']);
 for(const action of ['openAbout','closeAbout','openPrivacy'])assert.match(app,new RegExp('data-action="'+action+'"'));
 for(const file of ['docs/privacy.html','docs/contact.html'])assert.match(app,new RegExp(file.replace('.','\\.')));
 assert.match(app,/https:\/\/github\.com\/xf00889/);
 assert.match(app,/target="_blank" rel="noopener noreferrer"/);
 assert.match(app,/footer-about/);
});

test('Public-ready policy contains accurate data use explanations and contact',()=>{
 const privacy=read('docs/privacy.html');
 const contact=read('docs/contact.html');
 for(const phrase of ['not encrypted by QuestionForge','ChatGPT','GCash','drafts','hutchiejn@gmail.com','November 15, 2026'])assert.ok(privacy.includes(phrase),phrase);
 assert.match(contact,/mailto:hutchiejn@gmail.com/);
 assert.match(contact,/https:\/\/github\.com\/xf00889/);
 for(const file of ['docs/index.html','docs/legal.css','docs/brand-mark.svg','LEGAL_PUBLISHING.md'])assert.equal(existsSync(new URL('../'+file,import.meta.url)),true,file);
 assert.match(read('LEGAL_PUBLISHING.md'),/public, working HTTPS/);
});

test('About links do not auto-share or add remote code',()=>{
 const app=read('app.js');
 assert.doesNotMatch(app,/fetch\(['"]https:\/\/github\.com\/xf00889/);
 assert.doesNotMatch(app,/document\.write\(/);
 assert.match(read('styles.css'),/\.about-dialog/);
 assert.match(read('styles.css'),/\.footer \.footer-about/);
});
