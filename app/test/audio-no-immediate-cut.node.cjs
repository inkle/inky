"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AudioPreview } = require('../renderer/audioPreview.js');
class AudioMock {
  static instances=[];
  constructor(src) { this.src=src; this.paused=true; this.volume=1; this.loop=false; this.events={}; AudioMock.instances.push(this); }
  addEventListener(type,fn) { (this.events[type] ||= []).push(fn); }
  play() { this.paused=false; return Promise.resolve(); }
  pause() { this.paused=true; }
  removeAttribute(key) { if(key==='src') this.src=''; }
  load() {}
}
const oldAudio=global.Audio;
test('Empty tags do not abruptly cut ongoing music or sound', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inky-revert91-'));
 try {
  fs.mkdirSync(path.join(dir,'audio/music'),{recursive:true}); fs.mkdirSync(path.join(dir,'audio/sfx'),{recursive:true});
  fs.writeFileSync(path.join(dir,'audio/music/ambient.mp3'),'fixture');
  fs.writeFileSync(path.join(dir,'audio/sfx/bell.wav'),'fixture');
  global.Audio=AudioMock; AudioMock.instances=[];
  AudioPreview.configure({getProjectDir:()=>dir,getVolume:()=>1,getBaseVolume:()=>0.5});
  AudioPreview.beginPlaythrough();
  AudioPreview.handleTags(['music: ambient.mp3','sound: bell.wav'],true,1);
  const [music,effect]=AudioMock.instances;
  assert.ok(music && effect); assert.equal(music.paused,false); assert.equal(effect.paused,false);
  AudioPreview.handleTags(['sound:'],true,2);
  AudioPreview.handleTags(['music:'],true,3);
  assert.equal(music.paused,false,'empty music tag no longer cuts the music immediately');
  assert.equal(effect.paused,false,'empty sound tag no longer cuts the effect immediately');
  assert.equal(AudioPreview.getControlState().available,true,'actual playback keeps volume available');
 } finally {AudioPreview.stopAll(); global.Audio=oldAudio; fs.rmSync(dir,{recursive:true,force:true});}
});
