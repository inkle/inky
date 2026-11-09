const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const { AudioPreview } = require(path.join(root,'app/renderer/audioPreview.js'));
const { buildWebExport } = require(path.join(root,'app/renderer/webExporter.js'));
const { resolveAudioReference } = require(path.join(root,'app/renderer/audioTags.js'));

function withFixture(cb){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inky-audiomenu-'));try {return cb(dir)}finally {fs.rmSync(dir,{force:true,recursive:true})}}
function mkfile(root, rel){const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'test audio');return f}

const originalAudio=global.Audio;
class MockAudio {constructor(src){this.src=src;this.volume=1;this.listeners={};this.paused=true;this.loop=false;}addEventListener(n,fn){this.listeners[n]=fn}play(){this.paused=false;return Promise.resolve()}pause(){this.paused=true}removeAttribute(n){if(n==='src')this.src=''}load(){}}
global.Audio=MockAudio;

test('Preview volume requires a resolvable reference AND active playback',()=>withFixture(dir=>{
 AudioPreview.configure({getProjectDir:()=>dir, getVolume:()=>1,getBaseVolume:()=>0.5});
 AudioPreview.noteTags(['music: stop','sound: stop','music: no-file.mp3','sound: incorrect.txt']);
 assert.equal(AudioPreview.getControlState().available,false);
 const wav=mkfile(dir,'audio/sfx/step.wav');
 AudioPreview.noteTags(['sound: step.wav']);
 assert.equal(AudioPreview.getControlState().available,false, 'a resolvable tag alone is not a playing sound');
 AudioPreview.handleTags(['sound: step.wav'],true,1);
 assert.equal(AudioPreview.getControlState().available,true);
 fs.unlinkSync(wav);AudioPreview.refreshAvailability();
 assert.equal(AudioPreview.getControlState().available,false);
 mkfile(dir,'audio/sfx/step.wav');
 AudioPreview.handleTags(['sound: step.wav'],true,2);
 assert.equal(AudioPreview.getControlState().available,true);
 AudioPreview.stopSoundEffects();
 assert.equal(AudioPreview.getControlState().available,false);
 AudioPreview.beginPlaythrough();AudioPreview.endReplay();AudioPreview.stopAll();
}));

test('Preview resolves explicit paths and rejects ambiguous names and wrong category',()=>withFixture(dir=>{
 AudioPreview.configure({getProjectDir:()=>dir,getVolume:()=>1,getBaseVolume:()=>0.5});
 mkfile(dir,'assets/sound/unique.ogg');
 AudioPreview.handleTags(['sound: unique.ogg'],true,1);
 assert.equal(AudioPreview.getControlState().available,false);
 AudioPreview.handleTags(['sound: assets/sound/unique.ogg'],true,2);
 assert.equal(AudioPreview.getControlState().available,true);
 AudioPreview.stopSoundEffects();
 assert.equal(AudioPreview.getControlState().available,false);
 mkfile(dir,'audio/music/track.mp3');
 AudioPreview.handleTags(['sound: track.mp3'],true,3);
 assert.equal(AudioPreview.getControlState().available,false);
 AudioPreview.handleTags(['music: track.mp3'],true,4);
 assert.equal(AudioPreview.getControlState().available,true);
 mkfile(dir,'audio/track.mp3');AudioPreview.refreshAvailability();
 assert.equal(AudioPreview.getControlState().available,true, 'already-playing track remains valid after an unrelated duplicate appears');
 assert.equal(resolveAudioReference(dir,'track.mp3','music').kind,'ambiguous');
 AudioPreview.stopAll();
}));

async function buildFixture(story,createFiles){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inky-export-aud-'));
 try{
 const project=path.join(dir,'project');fs.mkdirSync(project);
 for(const name of createFiles)mkfile(project,name);
 const compiledJsonPath=path.join(dir,'compiled.json'), inkRuntimePath=path.join(dir,'ink.js');
 fs.writeFileSync(compiledJsonPath,JSON.stringify({inkVersion:21,root:story.map(s=>({'#':s}))}));
 fs.writeFileSync(inkRuntimePath,'// temporary runtime');
 const targetDirectory=path.join(dir,'output');
 const result=await buildWebExport({compiledJsonPath,targetDirectory,templateDirectory:path.join(root,'app/export-for-web-template'), inkRuntimePath, projectDirectory:project});
 const html=fs.readFileSync(path.join(targetDirectory,'index.html'),'utf8');
 return {audio:result.audio, enabled:/data-audio="on"/.test(html),html};
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('Export has no volume for stops, missing or invalid references',async()=>{
 const r=await buildFixture(['music: stop','sound: missing.wav','music: nope.txt'],[]);
 assert.equal(r.enabled,false);assert.deepEqual(r.audio.copied,[]);assert.deepEqual(r.audio.missing,['missing.wav']);
});
test('Export has no volume for ambiguous filenames',async()=>{
 const r=await buildFixture(['music: soundtrack.mp3'],['audio/music/soundtrack.mp3','audio/soundtrack.mp3']);
 assert.equal(r.enabled,false);assert.equal(r.audio.ambiguous.length,1);
});
test('Export detects an existing audio file in a custom folder',async()=>{
 const r=await buildFixture(['sound: effects/door.wav'],['effects/door.wav']);
 assert.equal(r.enabled,true);assert.deepEqual(r.audio.copied,['effects/door.wav']);
});
test('Export displays volume when at least one of multiple references resolves',async()=>{
 const r=await buildFixture(['sound: missing.wav','music: theme.mp3'],['audio/music/theme.mp3']);
 assert.equal(r.enabled,true);assert.deepEqual(r.audio.copied,['theme.mp3']);assert.deepEqual(r.audio.missing,['missing.wav']);
});
