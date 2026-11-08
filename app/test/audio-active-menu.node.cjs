"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { AudioPreview } = require('../renderer/audioPreview.js');

class MockAudio {
    static instances = [];
    constructor(src) { this.src = src; this.paused = true; this.volume = 1; this.listeners = {}; this.loop = false; MockAudio.instances.push(this); }
    addEventListener(event, fn) { (this.listeners[event] ||= []).push(fn); }
    emit(event) { (this.listeners[event] || []).forEach(fn => fn()); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { if( name === 'src' ) this.src = ''; }
    load() {}
}

function createFile(project, name) {
    const file = path.join(project, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'fake audio fixture');
    return file;
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
const originalAudio = global.Audio;

test('Preview: one-shot sound disappears at ended and returns on revisiting the scene', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-active-preview-'));
    try {
        global.Audio = MockAudio;
        MockAudio.instances = [];
        createFile(project, 'audio/sfx/door.wav');
        AudioPreview.configure({ getProjectDir: () => project, getVolume: () => 1, getBaseVolume: () => 0.5 });
        AudioPreview.beginPlaythrough();
        AudioPreview.handleTags(['sound: door.wav'], true, 1);
        assert.equal(AudioPreview.getControlState().available, true);
        MockAudio.instances.at(-1).emit('ended');
        assert.equal(AudioPreview.getControlState().available, false);
        AudioPreview.handleTags(['sound: door.wav'], true, 2);
        assert.equal(AudioPreview.getControlState().available, true);
        MockAudio.instances.at(-1).emit('error');
        assert.equal(AudioPreview.getControlState().available, false);
        AudioPreview.stopAll();
    } finally { global.Audio = originalAudio; fs.rmSync(project, {recursive:true,force:true}); }
});

test('Preview: looped music remains available; stopping fades, then hides volume', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-active-music-'));
    try {
        global.Audio = MockAudio;
        MockAudio.instances = [];
        createFile(project, 'audio/music/dawn.mp3');
        createFile(project, 'audio/sfx/chime.wav');
        AudioPreview.configure({ getProjectDir: () => project, getVolume: () => 1, getBaseVolume: () => 0.5 });
        AudioPreview.beginPlaythrough();
        AudioPreview.handleTags(['music: dawn.mp3'], true, 10);
        assert.equal(AudioPreview.getControlState().available, true);
        AudioPreview.handleTags(['sound: chime.wav'], true, 11);
        MockAudio.instances.at(-1).emit('ended');
        assert.equal(AudioPreview.getControlState().available, true, 'music keeps slider while effect ends');
        AudioPreview.handleTags(['music: stop'], true, 12);
        assert.equal(AudioPreview.getControlState().available, true, 'music still fades out');
        await wait(660);
        assert.equal(AudioPreview.getControlState().available, false);
        AudioPreview.stopAll();
    } finally { global.Audio = originalAudio; fs.rmSync(project, {recursive:true,force:true}); }
});

test('Preview: missing files and stop-only tags never show the volume control', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'inky-active-missing-'));
    try {
        global.Audio = MockAudio;
        AudioPreview.configure({ getProjectDir: () => project, getVolume: () => 1, getBaseVolume: () => 0.5 });
        AudioPreview.beginPlaythrough();
        AudioPreview.handleTags(['sound: missing.wav', 'music: stop', 'sound: stop'], true, 1);
        assert.equal(AudioPreview.getControlState().available, false);
    } finally { AudioPreview.stopAll(); global.Audio = originalAudio; fs.rmSync(project, {recursive:true,force:true}); }
});

function newExportEngine() {
    const source = fs.readFileSync(path.join(__dirname, '../export-for-web-template/main.js'), 'utf8');
    const start = source.indexOf('    var audioEngine = (function() {');
    const end = source.indexOf('\n    })();', start);
    assert.ok(start >= 0 && end > start);
    const ids = ['audio-control', 'audio-settings-anchor', 'controls', 'audio-toggle', 'audio-volume'];
    const elements = Object.fromEntries(ids.map(id => [id, {
        hidden: true, value: '50', attrs: {}, events: {},
        classList: { list: new Set(), toggle(c, b) { if(b)this.list.add(c);else this.list.delete(c); }, add(c){this.list.add(c);}, remove(c){this.list.delete(c);} },
        addEventListener(event, fn) { this.events[event] = fn; },
        setAttribute(name, value) { this.attrs[name] = value; }
    }]));
    const context = {
        document: { body: { getAttribute(k) { return { 'data-audio':'on', 'data-volume':'50' }[k] || null; } }, getElementById(id) { return elements[id]; }, addEventListener() {} },
        window: { localStorage: { getItem(){return null;}, setItem(){} } },
        Audio: MockAudio,
        console,
        setInterval, clearInterval,
    };
    vm.runInNewContext(source.slice(start, end+10).replace('var audioEngine =', 'var testEngine ='), context);
    return {engine: context.testEngine, elements};
}

test('Web export: volume is hidden before audio, shows during sound, hides at ended and returns', () => {
    MockAudio.instances = [];
    const {engine, elements} = newExportEngine();
    assert.equal(elements['audio-control'].hidden, true);
    engine.playSoundUrl('sound.wav');
    assert.equal(elements['audio-control'].hidden, false);
    const first = MockAudio.instances.at(-1);
    first.emit('ended');
    assert.equal(elements['audio-control'].hidden, true);
    engine.playSoundUrl('sound.wav');
    assert.equal(elements['audio-control'].hidden, false);
    engine.stopSoundEffects();
    assert.equal(elements['audio-control'].hidden, true);
});

test('Web export: sound ending does not hide controls while music is looping', async () => {
    MockAudio.instances = [];
    const {engine, elements} = newExportEngine();
    engine.setMusicUrl('theme.mp3');
    assert.equal(elements['audio-control'].hidden, false);
    engine.playSoundUrl('click.wav');
    MockAudio.instances.at(-1).emit('ended');
    assert.equal(elements['audio-control'].hidden, false);
    engine.setMusicUrl(null);
    assert.equal(elements['audio-control'].hidden, false);
    await wait(660);
    assert.equal(elements['audio-control'].hidden, true);
});
