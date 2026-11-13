"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inky-project-startup-')),userData=path.join(root,'profile');fs.mkdirSync(userData);
 const recent=path.join(userData,'recent-files.json'),ipc=new EventEmitter(),windows=[],errors=[];let denied=null,denyWrites=false;
 class Window extends EventEmitter{constructor(){super();this.webContents=new EventEmitter();this.webContents.send=()=>{};windows.push(this)}loadURL(){}setSheetOffset(){}}
 const fileSystem=new Proxy(fs,{get(target,key){
  if(key==='accessSync')return(file,mode)=>{if(file===denied)throw Object.assign(Error('denied'),{code:'EACCES'});return fs.accessSync(file,mode)};
  if(key==='writeFileSync')return(file,...args)=>{if(file===recent&&denyWrites)throw Object.assign(Error('read only'),{code:'EACCES'});return fs.writeFileSync(file,...args)};
  return target[key];
 }});
 const filename=path.join(__dirname,'../main-process/projectWindow.js'),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,__dirname:path.dirname(filename),process,console:{error:(...args)=>errors.push(args)},require(name){
  if(name==='electron')return{ipcMain:ipc,BrowserWindow:Window,app:{getPath:()=>userData},Menu:{}};
  if(name==='fs')return fileSystem;
  if(name==='./inklecate.js')return{Inklecate:{}};
  if(name==='./inkyFileDialog.js')return{};
  if(name==='./i18n/i18n.js')return{_:s=>s};
  return require(name);
 }},{filename});
 return{root,userData,recent,ipc,windows,errors,ProjectWindow:module.exports.ProjectWindow,
  fixture(name){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'Saved project.\n-> DONE\n');return file},
  history:value=>fs.writeFileSync(recent,JSON.stringify(value)),deny:file=>{denied=file},denyWrites:()=>{denyWrites=true},close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function launchMain(m,args=[],pending){
 const app=new EventEmitter(),opened=[];let created=0,callbacks;app.getPath=()=>m.userData;
 const project=Object.assign({},m.ProjectWindow,{open:file=>opened.push(file),createEmpty:()=>created++,setEvents(){},withMainkInkPath:()=>null,getViewSettings:()=>({theme:'light',zoom:'100',animationEnabled:true})});
 const menus=new Proxy({},{get:(_target,key)=>key==='setCallbacks'?value=>{callbacks=value}:()=>{}}),ipc=new EventEmitter();ipc.handle=()=>{};
 const filename=path.join(__dirname,'../main-process/main.js');
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{__dirname:path.dirname(filename),console:{log(){}},process:{argv:['/opt/inky/Inky',...args],env:{OWD:m.root},cwd:()=>m.root,platform:'linux'},require(name){
  if(name==='electron')return{app,ipcMain:ipc,BrowserWindow:{},Menu:{},dialog:{}};
  if(name==='./projectWindow.js')return{ProjectWindow:project};
  if(name==='./appmenus.js')return{AppMenus:menus};
  if(name==='./aboutWindow.js')return{AboutWindow:{changeTheme(){}}};
  if(name==='./documentationWindow.js')return{DocumentationWindow:{changeTheme(){}}};
  if(name==='./forceQuitDetect')return{onForceQuit(){}};
  if(name==='./inklecate.js')return{Inklecate:{killSessions(){}}};
  if(name==='./systemFonts.js')return{listSystemFonts(){}};
  if(name==='./exportSuccessDialog.js')return{exportSuccessDialogOptions(){}};
  if(name==='./inkyDialog.js')return{showInkyDialog(){}};
  if(name==='./inkyFileDialog.js')return{};
  if(name==='./i18n/i18n.js')return{_:s=>s};
  if(name==='original-fs')return fs;
  return require(name);
 }},{filename});
 if(pending){app.emit('will-finish-launching');app.emit('open-file',{preventDefault(){}},pending);assert.equal(opened.length,0,'OS requests must wait until ready')}
 app.emit('ready');return{app,opened,created:()=>created,callbacks};
}
describe('Restore the last saved project on startup',()=>{
 let m;beforeEach(()=>{m=setup()});afterEach(()=>m.close());
 it('keeps the welcome story on first launch',()=>{
  assert.equal(m.ProjectWindow.getStartupPath(null,[],m.root),null);const app=launchMain(m);assert.equal(app.created(),1);assert.deepEqual(app.opened,[]);
 });
 it('reopens the newest valid saved project instead of the starter',()=>{
  const old=m.fixture('old/main.ink'),latest=m.fixture('O Vilarejo/story.ink');m.history([latest,old]);const app=launchMain(m);assert.deepEqual(app.opened,[latest]);assert.equal(app.created(),0);
 });
 it('skips missing, unreadable, non-Ink and directory entries',()=>{
  const denied=m.fixture('denied.ink'),valid=m.fixture('valid.ink'),text=m.fixture('readme.txt'),directory=path.join(m.root,'folder.ink');fs.mkdirSync(directory);m.deny(denied);
  m.history([path.join(m.root,'deleted.ink'),denied,text,directory,valid]);assert.equal(m.ProjectWindow.getStartupPath(null,[],m.root),valid);fs.unlinkSync(valid);assert.equal(m.ProjectWindow.getStartupPath(null,[],m.root),null);
 });
 it('prioritizes explicit CLI paths, including relative paths with spaces',()=>{
  const recent=m.fixture('recent.ink'),explicit=m.fixture('Other project/MAIN.INK');m.history([recent]);const app=launchMain(m,['--user-data-dir=ignored.ink','Other project/MAIN.INK']);assert.deepEqual(app.opened,[explicit]);
 });
 it('queues OS file opens and opens once, ahead of CLI and recent history',()=>{
  const recent=m.fixture('recent.ink'),cli=m.fixture('cli.ink'),osFile=m.fixture('os.ink');m.history([recent]);const app=launchMain(m,[cli],osFile);assert.deepEqual(app.opened,[osFile]);app.app.emit('open-file',{preventDefault(){}},cli);assert.deepEqual(app.opened,[osFile,cli]);
 });
 it('falls back to history if an explicit request is unavailable',()=>{
  const recent=m.fixture('recent.ink');m.history([recent]);assert.equal(m.ProjectWindow.getStartupPath(path.join(m.root,'gone.ink'),['gone-too.ink'],m.root),recent);
 });
 it('handles malformed JSON and validates the recent-files array',()=>{
  for(const text of ['{broken','{}','null','"not a list"']){fs.writeFileSync(m.recent,text);assert.equal(m.ProjectWindow.getStartupPath(null,[],m.root),null)}
  const valid=m.fixture('saved.ink');m.history([null,17,{},'','  ',valid]);assert.deepEqual(Array.from(m.ProjectWindow.getRecentFiles()),[valid]);assert.equal(m.ProjectWindow.getStartupPath(null,[],m.root),valid);
 });
 it('tracks open/focus order but ignores unsaved new projects',()=>{
  const a=m.fixture('a.ink'),b=m.fixture('b.ink'),win=m.ProjectWindow.open(a);m.ProjectWindow.open(b);assert.equal(m.ProjectWindow.getStartupPath(),b);win.browserWindow.emit('focus');assert.equal(m.ProjectWindow.getStartupPath(),a);m.ProjectWindow.createEmpty().browserWindow.emit('focus');assert.equal(m.ProjectWindow.getStartupPath(),a);assert.deepEqual(JSON.parse(fs.readFileSync(m.recent)),[a,b]);
 });
 it('remembers a first save and a renamed main file across startup',()=>{
  const win=m.ProjectWindow.createEmpty(),first=m.fixture('my project/main.ink');m.ipc.emit('main-file-saved',{sender:win.browserWindow.webContents},first);assert.equal(win.mainInkAbsPath,first);assert.equal(m.ProjectWindow.getStartupPath(),first);
  const renamed=path.join(path.dirname(first),'renamed.ink');fs.renameSync(first,renamed);m.ipc.emit('main-file-saved',{sender:win.browserWindow.webContents},renamed);assert.equal(m.ProjectWindow.getStartupPath(),renamed);assert.deepEqual(launchMain(m).opened,[renamed]);
 });
 it('keeps File > New available when history exists',()=>{
  const saved=m.fixture('saved.ink');m.history([saved]);const app=launchMain(m);app.callbacks.new();assert.deepEqual(app.opened,[saved]);assert.equal(app.created(),1);
 });
 it('supports clearing history and tolerates history write failures',()=>{
  const saved=m.fixture('saved.ink');m.history([saved]);m.ProjectWindow.clearRecentFiles();assert.equal(m.ProjectWindow.getStartupPath(),null);m.denyWrites();assert.doesNotThrow(()=>m.ProjectWindow.open(saved));assert.equal(m.windows.length,1);assert(m.errors.length>0);
 });
});
