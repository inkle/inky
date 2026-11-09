"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { AudioPreview } = require('../renderer/audioPreview.js');
const { buildWebExport } = require('../renderer/webExporter.js');

class MockAudio {
    static instances = [];
    constructor(src) { this.src=src; this.volume=1; this.loop=false; this.paused=true; this.listeners={}; MockAudio.instances.push(this); }
    addEventListener(event, fn) { (this.listeners[event] ||= []).push(fn); }
    emit(event) { for(const fn of this.listeners[event] || []) fn(); }
    play() { this.paused=false; return Promise.resolve(); }
    pause() { this.paused=true; }
    removeAttribute(name) { if(name==='src') this.src=''; }
    load() {}
}
const app = path.resolve(__dirname,'..');
const webSource = fs.readFileSync(path.join(app,'export-for-web-template/main.js'),'utf8');

function fixture() {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'inky-audio93-'));
    for(const name of ['audio/music/ambient.mp3','audio/sfx/bell.wav']) {
        const file=path.join(root,name); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,'fixture');
    }
    return root;
}
test('Preview: empty and malformed music/sound tags do not stop concurrent valid tracks', () => {
    const root=fixture();const old=global.Audio;
    try {
        MockAudio.instances=[];global.Audio=MockAudio;
        AudioPreview.configure({getProjectDir:()=>root,getVolume:()=>1,getBaseVolume:()=>.5});
        AudioPreview.beginPlaythrough();
        AudioPreview.handleTags(['music: ambient.mp3','sound: bell.wav'],true,1);
        const [music,sound]=MockAudio.instances;
        assert.ok(music && sound);assert.equal(AudioPreview.getControlState().available,true);
        for(const tag of ['music:','sound:','music: wrong.mp','sound: wrong.mp','music: missing.mp3'])
            AudioPreview.handleTags([tag],true,2);
        assert.equal(music.paused,false); assert.equal(sound.paused,false);
        assert.equal(AudioPreview.getState().music,'ambient.mp3');
        assert.equal(AudioPreview.getControlState().available,true);
        sound.emit('ended'); assert.equal(AudioPreview.getControlState().available,true,'loop music still active');
        AudioPreview.handleTags(['sound: stop'],true,3);
        assert.equal(music.paused,false,'explicit sound stop does not affect music');
    } finally { AudioPreview.stopAll(); global.Audio=old; fs.rmSync(root,{recursive:true,force:true}); }
});

function exportedHandler() {
    const start=webSource.indexOf('    function processAudioTag(tag) {');
    const end=webSource.indexOf('    // What the saved game remembers',start);
    assert.ok(start>=0&&end>start);
    const calls={music:[],sfx:[],stop:0};
    const context={
        audioEngine:{setMusicUrl(v){calls.music.push(v);},playSoundUrl(v){calls.sfx.push(v);},stopSoundEffects(){calls.stop++;}},
        splitPropertyTag(tag){ const index=tag.indexOf(':');return index<0?null:{property:tag.slice(0,index),val:tag.slice(index+1).trim()};},
        audioUrlForFile(name){return /\.(mp3|ogg|wav)$/i.test(name)?'audio/'+name:null;},console:{warn(){}},
    };
    vm.runInNewContext(webSource.slice(start,end).replace('function processAudioTag(tag)','this.process = function(tag)'),context);
    return { calls,process:context.process };
}
test('Web runtime: empty or malformed tags do not stop audio; only explicit stops do', () => {
    const {calls,process}=exportedHandler();
    process('music: ambient.mp3');process('sound: bell.wav');
    process('sound:');process('sound: bad.mp');process('music:');process('music: bad.mp');
    assert.equal(calls.stop,0);assert.deepEqual(calls.music,['audio/ambient.mp3']);
    assert.deepEqual(calls.sfx,['audio/bell.wav']);
    process('sound: stop');process('music: stop');
    assert.equal(calls.stop,1);assert.deepEqual(calls.music,['audio/ambient.mp3',null]);
});

function exportedEngine({startingVolume='0',storedVolume=null,muted=false}={}) {
    const start=webSource.indexOf('    var audioEngine = (function() {');
    const end=webSource.indexOf('\n    })();',start);
    assert.ok(start>=0&&end>start);
    const ids=['audio-control','audio-settings-anchor','controls','audio-toggle','audio-volume'];
    const elements=Object.fromEntries(ids.map(id=>[id,{
        hidden:true,value:'0',attrs:{},events:{},
        classList:{toggle(){}},addEventListener(name,fn){this.events[name]=fn;},setAttribute(n,v){this.attrs[n]=v;}
    }]));
    const context={
        document:{body:{getAttribute(k){return {'data-audio':'on','data-volume':startingVolume,'data-sfx-volume':'100','data-master-volume':'100'}[k]||null;}},getElementById(id){return elements[id];},addEventListener(){}},
        window:{localStorage:{getItem(k){return k==='inky-audio-muted'?(muted?'1':'0'):k==='inky-audio-volume'?storedVolume:null;},setItem() {}}},
        Audio:MockAudio,console,setInterval,clearInterval,
    };
    vm.runInNewContext(webSource.slice(start,end+'\n    })();'.length).replace('var audioEngine =','var testEngine ='),context);
    return {engine:context.testEngine,elements};
}
test('Web: zero reader volume keeps SFX active and offers an immediately usable volume control', () => {
    MockAudio.instances=[];
    const {engine,elements}=exportedEngine({startingVolume:'0'});
    engine.playSoundUrl('audio/bell.wav');
    const sound=MockAudio.instances[0];
    assert.ok(sound);assert.equal(sound.paused,false);assert.equal(sound.volume,0);
    assert.equal(elements['audio-control'].hidden,false);
    assert.equal(elements['audio-settings-anchor'].hidden,false);
    elements['audio-volume'].value='60';elements['audio-volume'].events.input();
    assert.equal(sound.volume,.6);
    sound.emit('ended');assert.equal(elements['audio-control'].hidden,true);
});
test('Web: persisted mute still permits sound to start silently and the speaker button restores it', () => {
    MockAudio.instances=[];
    const {engine,elements}=exportedEngine({startingVolume:'50',storedVolume:'50',muted:true});
    engine.playSoundUrl('audio/bell.wav');
    const sound=MockAudio.instances[0];
    assert.equal(sound.volume,0);assert.equal(elements['audio-control'].hidden,false);
    elements['audio-toggle'].events.click();
    assert.equal(sound.volume,.5);
    sound.emit('ended'); assert.equal(elements['audio-control'].hidden,true);
});

test('Web export rewrites missing audio references to inert tags, but copies valid audio and reports missing files', async () => {
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'inky-export93-'));
    try {
        const project=path.join(temp,'project');const output=path.join(temp,'output');
        fs.mkdirSync(path.join(project,'audio/music'),{recursive:true});
        fs.writeFileSync(path.join(project,'audio/music/theme.mp3'),'fixture');
        const storyPath=path.join(temp,'compiled.json'),runtimePath=path.join(temp,'ink.js');
        fs.writeFileSync(storyPath,JSON.stringify({inkVersion:21,root:[{'#':'sound: absent.wav'},{'#':'music: theme.mp3'}]}));
        fs.writeFileSync(runtimePath,'// inkjs mock');
        const result=await buildWebExport({compiledJsonPath:storyPath,targetDirectory:output,templateDirectory:path.join(app,'export-for-web-template'),inkRuntimePath:runtimePath,projectDirectory:project});
        assert.deepEqual(result.audio.missing,['absent.wav']);assert.deepEqual(result.audio.copied,['theme.mp3']);
        const jsFiles=fs.readdirSync(output).filter(x=>x.endsWith('.js'));
        const contents=jsFiles.map(x=>fs.readFileSync(path.join(output,x),'utf8')).join('\n');
        assert.ok(!contents.includes('sound: absent.wav'),'missing files may not be executed by player');
        assert.ok(contents.includes('music: music/theme.mp3'),'valid tag was rewritten into bundled path');
    } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
