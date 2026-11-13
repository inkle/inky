// Real save/quit/relaunch regression. Usage: node this-file BINARY NEW_OUTPUT_DIR
// INKY_TEST_MAIN optionally selects the development Electron main entry.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,sleep}=require('./preview-session.cjs');
const [binaryArg,outputArg]=process.argv.slice(2);
if(!binaryArg||!outputArg)throw Error('Usage: startup-relaunch-check.cjs BINARY NEW_OUTPUT_DIRECTORY');
const binary=path.resolve(binaryArg),output=path.resolve(outputArg),sessionDir=path.join(output,'session'),profile=path.join(sessionDir,'profile');
fs.mkdirSync(output,{recursive:true});
const projectA=path.join(output,'projects','A com espaços','main.ink'),projectB=path.join(output,'projects','B','main.ink');
fs.mkdirSync(path.dirname(projectA),{recursive:true});fs.mkdirSync(path.dirname(projectB),{recursive:true});
const alpha='-> start\n=== start ===\n#title: Alpha\nSaved alpha project.\n-> DONE\n';
const beta='-> start\n=== start ===\n#title: Beta\nSaved beta project.\n-> DONE\n';
const results=[];let app;
async function state(name){
 const value=await app.evaluate(`(()=>{const p=require('./inkProject.js').InkProject.currentProject;return{path:p.mainInk.absolutePath(),source:p.mainInk.getValue(),ready:p.ready,version:require('../package.json').distributionVersion}})()`);
 results.push({name,...value});fs.writeFileSync(path.join(output,'states.json'),JSON.stringify(results,null,2));return value;
}
async function open(fixture=''){
 fs.rmSync(path.join(profile,'DevToolsActivePort'),{force:true});
 app=await launch({binary,appPath:process.env.INKY_TEST_MAIN,fixture,output:sessionDir,flags:['--no-sandbox'],viewSettings:{theme:'light',zoom:'100',animationEnabled:true}});
 await app.until(`window.ace && !!document.querySelector('#title-screen .choice-button')`);
 await app.until(`require('./inkProject.js').InkProject.currentProject?.ready`);await sleep(400);
}
async function quit(){
 const active=app,child=active.child;
 await active.evaluate(`setTimeout(()=>require('./inkProject.js').InkProject.currentProject.closeImmediate(),50);true`);
 for(let i=0;i<100&&child.exitCode===null;i++)await sleep(50);
 assert.equal(child.exitCode,0,'The application must quit normally before relaunch');
 await active.close();app=null;
}
async function save(dialogResult){
 return app.evaluate(`new Promise((resolve,reject)=>{const ipc=require('electron').ipcRenderer,original=ipc.invoke;ipc.invoke=function(channel,...args){return channel==='showSaveDialog'?Promise.resolve(${JSON.stringify(dialogResult)}):original.call(this,channel,...args)};try{require('./inkProject.js').InkProject.currentProject.save(success=>{ipc.invoke=original;resolve(success)})}catch(e){ipc.invoke=original;reject(e)}})`);
}
const pass=name=>console.log('PASS '+name);
(async()=>{try{
 await open();let s=await state('first launch');assert.equal(s.path,null);assert(s.source.includes('The Borrowed Star'));pass('first launch keeps the starter');
 assert.equal(await save({canceled:true}),false);assert(!fs.existsSync(path.join(profile,'recent-files.json')));pass('canceling Save does not record a project');
 await app.evaluate(`ace.edit('editor').setValue(${JSON.stringify(alpha)},-1)`);
 assert.equal(await save({canceled:false,filePath:projectA.slice(0,-4)}),true);assert.equal(fs.readFileSync(projectA,'utf8'),alpha);
 for(let i=0;i<50;i++){try{if(JSON.parse(fs.readFileSync(path.join(profile,'recent-files.json'),'utf8'))[0]===projectA)break}catch{}await sleep(50)}
 assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'recent-files.json'),'utf8'))[0],projectA);pass('real Save writes Ink/YAML and remembers the saved main path');
 await quit();await open();s=await state('restart A without arguments');assert.equal(s.path,projectA,'Normal startup must restore the project saved in the previous process');assert.equal(s.source,alpha);pass('normal relaunch restores the saved project');
 // Save an edited existing project and verify it still wins on the next launch.
 const revised=alpha.replace('Saved alpha project.','Saved alpha project, revised.');await app.evaluate(`ace.edit('editor').setValue(${JSON.stringify(revised)},-1)`);assert.equal(await save({canceled:true}),true);await quit();
 await open();s=await state('restart edited A');assert.equal(s.path,projectA);assert.equal(s.source,revised);pass('saving an existing project persists its content across relaunch');await quit();
 fs.writeFileSync(projectB,beta);await open(projectB);s=await state('explicit B overrides A');assert.equal(s.path,projectB);assert.equal(s.source,beta);pass('explicit file takes priority over recent history');await quit();
 await open();s=await state('restart B without arguments');assert.equal(s.path,projectB);assert.equal(s.source,beta);pass('last opened saved project is restored');await quit();
 fs.unlinkSync(projectB);await open();s=await state('missing B falls back to A');assert.equal(s.path,projectA);pass('deleted recent files fall back to an available project');await quit();
 fs.writeFileSync(path.join(profile,'recent-files.json'),'{broken');await open();s=await state('malformed history');assert.equal(s.path,null);assert(s.source.includes('The Borrowed Star'));pass('invalid history falls back to the starter without crashing');await quit();
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,checks:9,states:results},null,2));console.log('SAVE AND RESTART REGRESSION PASSED');
}finally{if(app)await app.close()}})().then(()=>process.exit(0),e=>{console.error(e);fs.writeFileSync(path.join(output,'failure.txt'),e.stack+'\n');process.exit(1)});
