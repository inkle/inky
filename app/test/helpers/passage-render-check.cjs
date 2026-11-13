// Real Chromium/native compiler. Usage: node passage-render-check.cjs BINARY NEW_OUTPUT_DIR [DEVELOPMENT_MAIN]
// INKY_PERF_REQUIRE_ATOMIC=1 rejects frames with partially displayed incoming text.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,sleep}=require('./preview-session.cjs');
const [binary,outputArg,appPath]=process.argv.slice(2),output=path.resolve(outputArg);
fs.mkdirSync(output,{recursive:true});
const fixture=path.join(output,'passage.ink');
const paragraphs=p=>Array.from({length:8},(_,i)=>p+' paragraph '+(i+1)+'. Ready.').join('\n');
fs.writeFileSync(fixture,'-> first\n=== first ===\n#title: First\n'+paragraphs('First')+'\n* [Next]\n    -> second\n=== second ===\n#title: Second\n'+paragraphs('Second')+'\n* [Finish]\n    -> ending\n=== ending ===\nThe final passage.\n-> END\n');
let app;
async function main(){
 app=await launch({binary:path.resolve(binary),appPath:appPath&&path.resolve(appPath),fixture,output,flags:['--no-sandbox'],viewSettings:{theme:'light',zoom:'100',animationEnabled:true}});
 let {evaluate,until,renderer}=app;
 await until("!!document.querySelector('#title-screen .choice-button')");
 await until("document.querySelector('.innerText.active .story-passage').textContent.includes('First paragraph 8')");
 await sleep(200);
 const results=[];
 const ev=expression=>evaluate(expression);
 function probe(player,selector,expected){return new Promise(resolve=>{
  const root=document.querySelector(player==='preview'?'#player':'.container');
  const t=performance.now();let samples=0,partialFrames=0;
  document.querySelector(selector).click();
  function sample(){
   samples++;
   const frame=player==='preview'?root.querySelector('.innerText.active'):root;
   const p=frame.querySelector('.story-passage');
   const nodes=[...frame.querySelectorAll('.scene-title,p')].filter(el=>!el.closest('.title-screen')&&!el.closest('.page-out')&&!el.classList.contains('page-out'));
   const ready=p.textContent.includes(expected)&&nodes.every(el=>Number(getComputedStyle(el).opacity)>=.99&&!el.classList.contains('hide'));
   if(ready)resolve({milliseconds:performance.now()-t,samples,partialFrames});
   else if(performance.now()-t>15000)resolve({timeout:true,partialFrames,text:p.textContent,nodes:nodes.map(el=>({text:el.textContent.slice(0,45),opacity:getComputedStyle(el).opacity,cls:el.className}))});
   else{if(p.textContent.includes(expected.includes('paragraph')?expected.split('paragraph')[0]+'paragraph 1':expected))partialFrames++;requestAnimationFrame(sample);}
  }
  requestAnimationFrame(sample);
 });}
 async function measure(player,selector,expected){
  await renderer.send('Performance.enable');
  if(!selector.includes('title-screen'))await ev("(()=>{let n=0;const root=document.querySelector("+JSON.stringify(player==='preview'?'.innerText.active':'.container')+");while(n++<100){const b=root.querySelector('.pager-next');if(!b||b.disabled||b.closest('[hidden]'))break;b.click();}})()");
  const before=(await renderer.send('Performance.getMetrics')).metrics;
  const result=await ev('('+probe.toString()+')('+JSON.stringify(player)+','+JSON.stringify(selector)+','+JSON.stringify(expected)+')');
  const after=(await renderer.send('Performance.getMetrics')).metrics;
  for(const name of ['LayoutCount','LayoutDuration','RecalcStyleCount','TaskDuration'])result[name]=after.find(m=>m.name===name).value-before.find(m=>m.name===name).value;
  results.push({player,selector,...result});console.log(JSON.stringify(results.at(-1)));assert(!result.timeout);
 }
 await measure('preview','#title-screen .choice-button','First paragraph 8');
 await measure('preview','.innerText.active .story-choices .choice-button','Second paragraph 8');
 await measure('preview','.innerText.active .story-choices .choice-button','The final passage');
 const webDir=path.join(output,'web','renderer');
 await evaluate("new Promise((resolve,reject)=>require('./liveCompiler.js').LiveCompiler.compileForWeb((error,file)=>error?reject(Error(error)):resolve(file))).then(file=>require('./webExporter.js').buildWebExport({compiledJsonPath:file,targetDirectory:"+JSON.stringify(webDir)+",templateDirectory:require('path').resolve(__dirname,'../export-for-web-template'),inkRuntimePath:require('path').resolve(__dirname,'../node_modules/inkjs/dist/ink.js'),projectDirectory:"+JSON.stringify(output)+",storyTitle:'Passage performance'}))");
 const shell=path.join(output,'web-main.cjs');
 fs.writeFileSync(shell,"const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1100,height:950,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});w.loadFile(process.argv.at(-1));});app.on('window-all-closed',()=>app.quit());");
 await app.close();
 app=await launch({binary:path.resolve(__dirname,'../../node_modules/electron/dist/electron'),appPath:shell,fixture:path.join(webDir,'index.html'),output:path.join(output,'web-browser'),flags:['--no-sandbox']});
 ({evaluate,until,renderer}=app);
 await until("document.readyState==='complete' && !!window.InkyChoiceText && !!document.querySelector('#title-screen .choice-button')");
 assert.equal(await ev("typeof require"),'undefined','The export must run without Node globals');
 await sleep(100);
 await measure('web','#title-screen .choice-button','First paragraph 8');
 await measure('web','#story-choices .choice-button','Second paragraph 8');
 await measure('web','#story-choices .choice-button','The final passage');
 fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(results,null,2)+'\n');
 if(process.env.INKY_PERF_REQUIRE_ATOMIC==='1'){
  assert(results.every(r=>r.partialFrames===0),'Passages must be complete at their first animation frame');
  assert(results.every(r=>r.milliseconds<1000),'Every passage must appear within one second');
 }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(app)await app.close()});
