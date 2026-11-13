const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,sleep}=require('./preview-session.cjs');
const {auditContrast:auditFocus}=require('./contrast-audit.cjs');
const audits=[];
async function audit(name,samples,frame){
 const result=await app.evaluate('('+auditFocus.toString()+')('+JSON.stringify({samples,frame})+')');
 audits.push({name,...result});fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify(audits,null,2)+'\n');
 const failures=result.results.filter(x=>!x.pass);console.log('AUDIT '+name+' '+result.results.length+' samples'+(failures.length?' FAIL '+JSON.stringify(failures):' PASS'));
 assert(result.pass,name+' has insufficient rendered contrast');
}
// Linux/X11 real-Electron regression and rendered-color audit.
// Usage: node test/helpers/focus-quiet-writing-check.cjs SOURCE_INK NEW_OUTPUT_DIR [ELECTRON]
// INKY_EXPERIMENTAL_INKLECATE may select an existing compatible native compiler.
// Source projects are copied; no file in the source directory is edited.
const [sourceArg,outputArg,electronArg]=process.argv.slice(2);
if(!sourceArg||!outputArg)throw Error('Usage: focus-quiet-writing-check.cjs SOURCE_INK NEW_OUTPUT_DIR [ELECTRON]');
if(process.platform!=='linux'||!process.env.DISPLAY)throw Error('This visual audit requires Linux/X11 and DISPLAY');
const sourceInk=path.resolve(sourceArg),output=path.resolve(outputArg),appDirectory=path.resolve(__dirname,'../..');
assert(fs.statSync(sourceInk).isFile()&&path.extname(sourceInk).toLowerCase()==='.ink','SOURCE_INK must be an existing Ink file');
assert(!fs.existsSync(output),'Use a new output directory to preserve previous evidence and avoid stale profiles');
const project=path.join(output,'project'),fixture=path.join(project,path.basename(sourceInk));
fs.mkdirSync(output,{recursive:true});fs.cpSync(path.dirname(sourceInk),project,{recursive:true});
const binary=electronArg?path.resolve(electronArg):path.join(appDirectory,'node_modules/electron/dist/electron');
const bootstrap=path.join(output,'test-main.cjs');
fs.writeFileSync(bootstrap,`const {app,Menu,ipcMain,BrowserWindow}=require('electron');
require(${JSON.stringify(path.join(appDirectory,'main-process/main.js'))});
ipcMain.handle('focus-test-theme',(_event,theme)=>{
 const view=Menu.getApplicationMenu().items.find(i=>i.label.replace(/&/g,'')==='View');
 const item=view.submenu.items.find(i=>i.label.replace(/&/g,'')==='Theme').submenu.items.find(i=>i.label.toLowerCase()===theme);
 if(!item)throw Error('Missing theme '+theme);item.click(item,BrowserWindow.getFocusedWindow());return true;
});
`);

const original=path.join(project,'focus-notes.ink'),renamed=path.join(project,'focus-notes-renamed.ink');
const source='// Caderno de teste do Focus.\nVAR visitas = 0\nLIST tempo = chuva, neve\n-> sala\n=== sala ===\n#title: Caderno\n#screen\nA chuva cai lá fora.\n* [Abrir o caderno]\n    ~ visitas = visitas + 1\n    -> END\n';
assert(!fs.existsSync(original)&&!fs.existsSync(renamed),'Temporary fixture names already exist in the copied project');
fs.writeFileSync(original,source);let app;
(async()=>{try{
 app=await launch({binary,appPath:bootstrap,fixture,output,flags:['--no-sandbox'],viewSettings:{theme:'focus',zoom:'125',animationEnabled:true}});
 await app.until("!!document.querySelector('#title-screen .choice-button')");
 await app.until("!!document.getElementById('f:focus-notes.ink_anchor')");
 await app.until("document.querySelector('.innerText.active .scene-title')?.textContent.includes('A Chegada') && document.querySelector('.innerText.active .story-visual img')?.complete");
 const name='Focus controls '+app.child.pid;
 await app.evaluate('document.title='+JSON.stringify(name));
 const exec=require('node:child_process').execFileSync;
 const windowId=exec('xwininfo',['-name',name],{encoding:'utf8'}).match(/Window id: (0x[\da-f]+)/i)[1];
 exec('python3',[path.resolve(__dirname,'preview-x11-window.py'),windowId]);
 await sleep(350);
 await app.evaluate("document.querySelector('#title-screen .choice-button').click()");
 fs.mkdirSync(path.join(output,'shots'),{recursive:true});
 async function shot(name){const s=await app.renderer.send('Page.captureScreenshot',{format:'png'});const f=path.join(output,'shots',name+'.png');fs.writeFileSync(f,Buffer.from(s.data,'base64'));return f}
 await app.evaluate("(()=>{const e=ace.edit('editor');e.gotoLine(1,0);e.focus()})()");
 await sleep(250);
 const shots=[await shot('00-quiet-writing-story')];
 await app.evaluate("require('./jquery-2.2.3.min.js')('#explorer-tree').jstree(true).show_contextmenu('f:focus-notes.ink')");
 await app.until("[...document.querySelectorAll('.vakata-context a')].some(e=>e.textContent.includes('Rename'))");
 const menu=await app.evaluate("(()=>{const a=[...document.querySelectorAll('.vakata-context a')].find(e=>e.textContent.includes('Rename')),r=a.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await app.renderer.send('Input.dispatchMouseEvent',{type:'mouseMoved',...menu});await sleep(80);
 const hover=await app.evaluate("(()=>{const a=[...document.querySelectorAll('.vakata-context a')].find(e=>e.textContent.includes('Rename')),s=getComputedStyle(a);return{bg:s.backgroundColor,color:s.color}})()");
 await audit('context-menu',[
  {name:'Menu labels',selector:'.vakata-context a'},
  {name:'Menu shortcuts',selector:'.vakata-contextmenu-shortcut'}
 ]);
 shots.push(await shot('01-context-hover'));
 await app.evaluate("[...document.querySelectorAll('.vakata-context a')].find(e=>e.textContent.includes('Rename')).click()");
 await app.until("!!document.querySelector('.jstree-rename-input')");
 assert.equal(await app.evaluate("document.querySelector('.jstree-rename-input').value"),'focus-notes');
 await audit('rename',[
  {name:'Rename input',selector:'.jstree-rename-input'},
  {name:'Rename boundary',selector:'.jstree-rename-input',property:'borderLeftColor',minimum:3}
 ]);
 shots.push(await shot('02-rename'));
 await app.evaluate("(()=>{const e=document.querySelector('.jstree-rename-input');e.focus();e.select()})()");
 await app.renderer.send('Input.insertText',{text:'focus-notes-renamed'});
 for(const type of ['keyDown','keyUp'])await app.renderer.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await app.until("!!document.getElementById('f:focus-notes-renamed.ink_anchor')");
 assert(!fs.existsSync(original));assert.equal(fs.readFileSync(renamed,'utf8'),source);
 await app.evaluate("(()=>{const tree=require('./jquery-2.2.3.min.js')('#explorer-tree').jstree(true);tree.deselect_all();tree.select_node('f:focus-notes-renamed.ink');document.getElementById('f:focus-notes-renamed.ink_anchor').focus()})()");
 for(const type of ['keyDown','keyUp'])await app.renderer.send('Input.dispatchKeyEvent',{type,key:'F2',code:'F2',windowsVirtualKeyCode:113});
 await app.until("!!document.querySelector('.jstree-rename-input')");
 assert.equal(await app.evaluate("document.querySelector('.jstree-rename-input').value"),'focus-notes-renamed');
 shots.push(await shot('02-f2-rename'));
 for(const type of ['keyDown','keyUp'])await app.renderer.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await app.until("!document.querySelector('.jstree-rename-input')");
 assert.equal(fs.readFileSync(renamed,'utf8'),source);

 await app.evaluate("(()=>{document.getElementById('f:focus-notes-renamed.ink_anchor').click();const e=ace.edit('editor');e.focus();e.selection.setRange(new (ace.require('ace/range').Range)(1,0,1,15))})()");
 await app.until("document.querySelector('.innerText.active .scene-title')?.textContent.includes('A Chegada') && document.querySelector('.innerText.active .story-visual img')?.complete");
 await sleep(200);
 await audit('editor-syntax-and-indicators',[
  {name:'Editor text',selector:'#editor'},
  {name:'Ink syntax',selector:'#editor .ace_line span'},
  {name:'Syntax on selection',selector:'#editor .ace_line span',backgroundSelector:'.ace_selection'},
  {name:'Line numbers',selector:'.ace_gutter-cell'},
  {name:'Explorer filename',selector:'#file-nav-wrapper .filename'},
  {name:'Explorer header',selector:'.file-explorer-header'},
  {name:'Toolbar message',selector:'#toolbar .issuesMessage'},
  {name:'Cursor',selector:'.ace_cursor',property:'borderLeftColor',backgroundSelector:'#editor',minimum:3,ignoreOpacity:true},
  {name:'Selection boundary',selector:'.ace_selection',property:'boxShadow',backgroundSelector:'.ace_selection',minimum:3},
  {name:'Active gutter marker',selector:'.ace_gutter-active-line',property:'boxShadow',minimum:3},
  {name:'Active line marker',selector:'#editor .ace_marker-layer .ace_active-line',property:'boxShadow',minimum:3},
  {name:'Toolbar icon',selector:'#toolbar .nav-toggle .icon',minimum:3}
 ]);
 const syntax=await app.evaluate("(()=>{const ed=document.querySelector('#editor'),s=getComputedStyle(ed),g=getComputedStyle(document.querySelector('.ace_gutter')),sel=getComputedStyle(document.querySelector('.ace_selection')),cur=getComputedStyle(document.querySelector('.ace_cursor'));return{editor:s.backgroundColor,text:s.color,gutter:g.backgroundColor,selection:sel.backgroundColor,cursor:cur.borderLeftColor,tokens:[...document.querySelectorAll('#editor .ace_line span')].map(e=>({text:e.textContent,kind:e.className,color:getComputedStyle(e).color}))}})()");
 assert(syntax.tokens.some(t=>t.kind.includes('ace_var-decl')));assert(syntax.tokens.some(t=>t.kind.includes('ace_logic')));assert.notEqual(syntax.selection,syntax.editor);
 shots.push(await shot('03-syntax-selection-cursor'));
 await app.evaluate("require('electron').ipcRenderer.invoke('focus-test-theme','dark')");await sleep(700);shots.push(await shot('03-graphite-comparison'));
 await app.evaluate("require('electron').ipcRenderer.invoke('focus-test-theme','contrast')");await sleep(700);shots.push(await shot('03-contrast-comparison'));
 await app.evaluate("require('electron').ipcRenderer.invoke('focus-test-theme','focus')");await sleep(700);
 await app.renderer.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:600,y:400});
 const toolbar=await app.evaluate("(()=>{const e=document.querySelector('#toolbar .nav-toggle'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,before:getComputedStyle(e.querySelector('.icon')).color}})()");
 await app.renderer.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:toolbar.x,y:toolbar.y});
 const after=await app.evaluate("getComputedStyle(document.querySelector('#toolbar .nav-toggle .icon')).color");assert.notEqual(after,toolbar.before);
 shots.push(await shot('04-toolbar-hover'));
 await app.evaluate("ace.edit('editor').execCommand('find')");await app.until("!!document.querySelector('.ace_search')");
 await audit('native-search',[
  {name:'Search input',selector:'.ace_search_field'},
  {name:'Search buttons',selector:'.ace_search_options .ace_button'},
  {name:'Search field boundary',selector:'.ace_search_form',property:'borderLeftColor',minimum:3}
 ]);
 shots.push(await shot('05-search'));
 await app.evaluate("ace.edit('editor').execCommand('replace')");
 await app.until("getComputedStyle(document.querySelector('.ace_replace_form')).display!=='none'");
 await app.evaluate("(()=>{const i=ace.edit('editor').searchBox.searchInput;i.focus();i.select()})()");
 await app.renderer.send('Input.insertText',{text:'A chuva cai lá fora.'});
 await app.until("ace.edit('editor').getSelectedText()==='A chuva cai lá fora.'");
 await app.evaluate("(()=>{const i=ace.edit('editor').searchBox.replaceInput;i.focus();i.select()})()");
 await app.renderer.send('Input.insertText',{text:'A neve cai lá fora.'});
 await audit('native-replace',[
  {name:'Replace input',selector:'.ace_replace_form .ace_search_field'},
  {name:'Replace actions',selector:'.ace_replacebtn'},
  {name:'Replace boundary',selector:'.ace_replace_form',property:'borderLeftColor',minimum:3}
 ]);
 shots.push(await shot('05-replace'));
 await app.evaluate("document.querySelector('.ace_replacebtn[action=replaceAndFindNext]').click()");
 await app.until("ace.edit('editor').getValue().includes('A neve cai lá fora.')");
 await app.evaluate("ace.edit('editor').undo()");
 assert.equal(await app.evaluate("ace.edit('editor').getValue()"),source);
 await app.evaluate("ace.edit('editor').searchBox.hide()");

 await app.evaluate("(()=>{const e=ace.edit('editor');e.gotoLine(12,0);e.focus()})()");
 assert.equal(await app.evaluate("ace.edit('editor').session.getLine(11)"),'','Ctrl+Space must be tested on an empty line');
 for(const type of ['keyDown','keyUp'])await app.renderer.send('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32,modifiers:type==='keyDown'?2:0});
 await app.until("!!document.querySelector('.ace_autocomplete .ace_line')");

 await audit('autocomplete',[
  {name:'Completion text',selector:'.ace_autocomplete .ace_line'},
  {name:'Completion metadata',selector:'.ace_autocomplete .ace_rightAlignedText'},
  {name:'Completion outline',selector:'.ace_autocomplete',property:'borderLeftColor',minimum:3}
 ]);
 shots.push(await shot('06-autocomplete'));await app.evaluate("ace.edit('editor').completer.detach()");
 await app.evaluate("(()=>{require('./toolbarView.js').ToolbarView.updateIssueSummary([{type:'ERROR',lineNumber:2,message:'Erro: conferir a legibilidade'},{type:'WARNING',lineNumber:3,message:'Aviso: conferir a legibilidade'}]);document.querySelector('.issuesSummary').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))})()");
 await audit('issues',[
  {name:'Error message',selector:'.issue-popup .error .issue'},
  {name:'Warning message',selector:'.issue-popup .warning .issue'},
  {name:'Issue line number',selector:'.issue-popup .line-no'}
 ]);
 shots.push(await shot('07-error-warning'));await app.evaluate("require('./toolbarView.js').ToolbarView.clearIssueSummary()");
 await app.evaluate("document.getElementById('f:game.yaml_anchor').click()");await app.until("!document.getElementById('game-settings-inline').hidden");
 await audit('settings',[
  {name:'Settings heading',selector:'h1'},
  {name:'Settings hint',selector:'header .hint'},
  {name:'Section headings',selector:'h2'},
  {name:'Selected option',selector:'.segmented input:checked + span'},
  {name:'Unselected option',selector:'.segmented input:not(:checked) + span'}
 ],'#game-settings-inline');
 for(const type of ['keyDown','keyUp'])await app.renderer.send('Input.dispatchKeyEvent',{type,key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});
 await app.evaluate("document.getElementById('game-settings-inline').contentDocument.querySelector('.segmented input:checked').focus()");
 assert(await app.evaluate("(()=>{const d=document.getElementById('game-settings-inline').contentDocument,r=d.querySelector('.segmented input:checked:focus-visible'),s=r&&getComputedStyle(r.nextElementSibling);return !!s && s.outlineStyle==='solid' && parseFloat(s.outlineWidth)>=2})()"));
 await audit('selected-radio-keyboard-focus',[
  {name:'Selected radio focus',selector:'.segmented input:checked:focus-visible + span',property:'outlineColor',minimum:3}
 ],'#game-settings-inline');
 shots.push(await shot('08-visual'));
 await app.evaluate("(()=>{const d=document.getElementById('game-settings-inline').contentDocument;d.getElementById('story-title').scrollIntoView({block:'center'});d.getElementById('story-title').focus()})()");
 await audit('settings-input',[
  {name:'Title input text',selector:'#story-title'},
  {name:'Title field boundary',selector:'#story-title',property:'borderLeftColor',minimum:3},
  {name:'Field focus outline',selector:'#story-title',property:'outlineColor',minimum:3},
  {name:'Clear button',selector:'#clear-story-title'}
 ],'#game-settings-inline');
 shots.push(await shot('09-settings-input'));
 await app.evaluate("document.getElementById('style-mode-text').click()");await app.until("document.getElementById('game-settings-inline').hidden");
 await audit('advanced-yaml',[
  {name:'YAML tokens',selector:'#editor .ace_line span'},
  {name:'Visual and Advanced tabs',selector:'.style-mode-tab'},
  {name:'Active tab indicator',selector:'.style-mode-tab.active',property:'boxShadow',minimum:3}
 ]);
 shots.push(await shot('10-advanced'));
 await app.evaluate("(()=>{window.__dialogResult=null;require('./navView.js').NavView.showDialog({title:'Diálogo do Explorer',message:'Conferir texto, ações e foco no Focus.',details:['Item temporário de teste'],note:'Nenhum arquivo será excluído.',buttons:[{label:'Cancelar',value:false},{label:'Confirmar',value:true,primary:true},{label:'Excluir',value:'delete',danger:true}]}).then(value=>window.__dialogResult=value);return true})()");
 await app.until("!!document.querySelector('.explorer-dialog')");
 await audit('explorer-dialog',[
  {name:'Dialog title',selector:'.explorer-dialog-title'},
  {name:'Dialog message',selector:'.explorer-dialog-message'},
  {name:'Dialog detail',selector:'.explorer-dialog-details'},
  {name:'Dialog secondary note',selector:'.explorer-dialog-note'},
  {name:'Dialog button text',selector:'.explorer-dialog-button'},
  {name:'Dialog boundary',selector:'.explorer-dialog',property:'borderLeftColor',minimum:3}
 ]);
 shots.push(await shot('11-explorer-dialog'));
 for(const type of ['keyDown','keyUp'])await app.renderer.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await app.until("!document.querySelector('.explorer-dialog')");assert.equal(await app.evaluate("window.__dialogResult"),false);
 const yamlFile=path.join(project,'game.yaml'),savedYaml=fs.readFileSync(yamlFile,'utf8');
 const probe='theme: dark\ncolors: &palette\n  background: "#0E1117"\n  text: "#F5F7FA"\nthemes:\n  dark:\n    colors: *palette\n';
 await app.evaluate("document.getElementById('f:game.yaml_anchor').click()");
 await app.until("!document.getElementById('style-mode-text').hidden && !document.getElementById('style-mode-text').disabled");
 await app.evaluate("document.getElementById('style-mode-text').click()");
 await app.until("document.getElementById('game-settings-inline').hidden");
 await app.evaluate("ace.edit('editor').setValue("+JSON.stringify(probe)+",-1)");
 await app.until("ace.edit('editor').session.getMode().$id==='ace/mode/yaml' && !!document.querySelector('#editor .ace_constant.ace_language')");
 await app.evaluate("(()=>{const e=ace.edit('editor');e.focus();e.selection.setRange(new (ace.require('ace/range').Range)(1,8,1,16))})()");
 await app.until("!!document.querySelector('#editor .ace_selection')");
 await sleep(120);
 await audit('yaml-anchors-and-selection',[
  {name:'YAML anchor and scalar text',selector:'#editor .ace_line span'},
  {name:'YAML syntax on selection',selector:'#editor .ace_line span',backgroundSelector:'.ace_selection'}
 ]);
 shots.push(await shot('12-yaml-anchor-selection'));
 await app.evaluate("ace.edit('editor').setValue("+JSON.stringify(savedYaml)+",-1)");
 await app.evaluate("new Promise(resolve=>require('./inkProject.js').InkProject.currentProject.save(resolve))");
 assert.equal(fs.readFileSync(yamlFile,'utf8'),savedYaml);
 const gpu=await app.browser.send('SystemInfo.getInfo');
 const report={verified:true,actualRename:true,actualF2:true,actualReplace:true,actualCtrlSpace:true,hover:{menu,colors:hover,toolbar:{before:toolbar.before,after}},syntax,audits,gpuFeatures:gpu.gpu.featureStatus,shots};
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verified:true,actualRename:true,hover:true,syntax:true,gpu:gpu.gpu.featureStatus.gpu_compositing,shots}));
}finally{if(app)await app.close();for(const p of [original,renamed,path.join(project,'contrast-anchor.yaml')])if(fs.existsSync(p))fs.unlinkSync(p)}})().catch(e=>{console.error(e);process.exitCode=1});
