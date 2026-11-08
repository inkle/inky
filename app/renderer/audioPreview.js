"use strict";

// Plays the story's #music: and #sound: tags in the Inky preview, from the project's "audio" folder.
// The preview replays the story whenever the writer edits it, so music that is already playing keeps
// going and sound effects only play on the turn being played now, never on a replay.
const fs = require("fs");
const { pathToFileURL } = require("url");
const { parseAudioTag, resolveAudioReference } = require("./audioTags.js");

const FADE_MS = 500;

let getProjectDir = () => null;
let getVolume = () => 0.5;
let getBaseVolume = () => 1;
let music = null;            // { file, element }
let wantedMusic = null;      // the music the story asks for now, even when its file is missing
let sawMusicTag = false;
// The menu's volume row, as in the exported page. The slider is the overall volume: it starts at
// the game.yaml "audio: volume" (the initial volume) and the player may move it from there. The
// speaker button mutes and restores it. Master / Music / SFX from game.yaml stay fixed multipliers.
let level = null;            // slider position, 0..1; null until first needed
let lastBase = null;         // the initial volume the slider was last set from
let muted = false;
let lastAudible = 1;
let sawAudioTag = false;     // whether the menu currently has an active, resolvable audio source
// Keep referenced tags, including missing files, so an added/removed asset updates the menu.
// Only valid file references are stored: music/sound stop and malformed names do not count.
const referencedAudio = new Map();
let controlListener = null;
const warned = new Set();
const sounds = new Map();     // active sound elements and their local source paths, if any
const fadingMusic = new Map(); // tracks still fading out after replacement or stop
let soundsPlayedFor = null;   // the player action these sounds belong to
const soundsPlayed = new Set();
let soundCounter = 0;

function configure(options) {
    if( options.getProjectDir ) getProjectDir = options.getProjectDir;
    if( options.getVolume ) getVolume = options.getVolume;
    if( options.getBaseVolume ) getBaseVolume = options.getBaseVolume;
    // A new configuration starts from its own initial volume.
    level = null;
    lastBase = null;
    muted = false;
    sawAudioTag = false;
    referencedAudio.clear();
}

function clampVolume(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

// The slider follows the initial volume of game.yaml until the player moves it; when the writer
// changes that initial volume, the slider starts again from the new value.
function syncBase() {
    const base = clampVolume(getBaseVolume());
    if( level === null || base !== lastBase ) {
        const changed = level !== null;
        lastBase = base;
        level = base;
        muted = false;
        lastAudible = base > 0 ? base : 0.5;
        return changed;
    }
    return false;
}

function volumeFor(category) {
    syncBase();
    return clampVolume(getVolume(category) * (muted ? 0 : level));
}

// Explorer playback is the writer auditioning a file: it follows the initial volume, not the
// player's slider or mute.
function previewFileVolume() {
    return clampVolume(getVolume("sfx") * clampVolume(getBaseVolume()));
}

// Resolve a sound file from the project folder.
function resolveRequest(request, warnOnFailure = true) {
    const dir = getProjectDir();
    const resolved = dir ? resolveAudioReference(dir, request.file, request.kind) : null;
    if( !resolved || resolved.kind !== "ok" ) {
        if( dir && warnOnFailure ) {
            if( resolved && resolved.kind === "ambiguous" )
                warnOnce(`Ambiguous sound file name: ${request.file}. Use an explicit path to select one: ${resolved.candidates.join(" or ")}`);
            else {
                const categoryFolder = request.kind === "music" ? "audio/music" : "audio/sfx";
                warnOnce(`Sound file not found: ${request.file} (looked in ${categoryFolder}, audio and the main story folder)`);
            }
        }
        return null;
    }
    return { url: pathToFileURL(resolved.source).href, sourcePath: resolved.source };
}

function warnOnce(message) {
    if( warned.has(message) ) return;
    warned.add(message);
    console.warn(message);
}

function fadeOutAndRemove(element, sourcePath) {
    const fade = { factor: 1, sourcePath };
    fadingMusic.set(element, fade);
    const started = Date.now();
    const timer = setInterval(() => {
        const progress = Math.min(1, (Date.now() - started) / FADE_MS);
        fade.factor = 1 - progress;
        element.volume = clampVolume(volumeFor("music") * fade.factor);
        if( progress >= 1 ) {
            clearInterval(timer);
            fadingMusic.delete(element);
            element.pause();
            element.removeAttribute("src");
            element.load();
            refreshReferencedAudioControl();
        }
    }, 40);
}

function stopMusic() {
    if( !music ) return;
    const old = music;
    music = null;
    fadeOutAndRemove(old.element, old.sourcePath);
    refreshReferencedAudioControl();
}

function startMusic(request, resolved) {
    if( !resolved ) return;
    stopMusic();
    const element = new Audio(resolved.url);
    element.loop = true;
    element.volume = volumeFor("music");
    element.addEventListener("error", () => {
        warnOnce(`Sound file not found or not playable: ${request.file}`);
        // A track that cannot play must not count as "already playing", or it could never be started again.
        if( music && music.element === element ) {
            music = null;
            element.pause();
            element.removeAttribute("src");
            element.load();
            refreshReferencedAudioControl();
        }
    });
    music = { file: request.file, url: resolved.url, sourcePath: resolved.sourcePath, element: element };
    refreshReferencedAudioControl();
    const attempt = element.play();
    if( attempt && attempt.catch ) attempt.catch(() => { /* error event reports a missing file */ });
}

function playSound(request, resolved) {
    if( !resolved ) return;
    const element = new Audio(resolved.url);
    element.volume = volumeFor("sfx");
    const finished = () => {
        if( sounds.delete(element) ) refreshReferencedAudioControl();
    };
    sounds.set(element, { sourcePath: resolved.sourcePath, category: "sfx" });
    refreshReferencedAudioControl();
    element.addEventListener("ended", finished);
    element.addEventListener("error", () => {
        warnOnce(`Sound file not found or not playable: ${request.file}`);
        finished();
    });
    const attempt = element.play();
    if( attempt && attempt.catch ) attempt.catch(finished);
}

// A new play-through starts (the story was recompiled or restarted).
function beginPlaythrough() {
    sawMusicTag = false;
    referencedAudio.clear();
    soundCounter = 0;
}

// The replay of earlier turns is over: if no music tag was met on the way, none should be playing.
function endReplay() {
    if( !sawMusicTag ) { wantedMusic = null; stopMusic(); }
    // Once the compiler replay finishes, hide a stale volume row if the new story no longer
    // references any resolvable audio. Keep the old row during replay to avoid flicker.
    refreshReferencedAudioControl();
}

// A sound file was added, deleted or replaced. A file that is gone must not keep playing from what
// the player already loaded; music whose file came back starts again.
function refreshAvailability() {
    if( music && music.sourcePath && !fs.existsSync(music.sourcePath) ) {
        warnOnce(`Sound file removed, music stopped: ${music.file}`);
        stopMusic();
    }
    sounds.forEach((sound, element) => {
        if( sound.sourcePath && !fs.existsSync(sound.sourcePath) ) {
            element.pause();
            element.removeAttribute("src");
            element.load();
            sounds.delete(element);
        }
    });
    if( !music && wantedMusic ) startMusic(wantedMusic, resolveRequest(wantedMusic, false));
    if( listening && !require("fs").existsSync(listening.absPath) ) stopListening();
    refreshReferencedAudioControl();
}

// For tests and diagnostics: what is playing now.
function getState() {
    return { music: music ? music.file : null, wanted: wantedMusic ? wantedMusic.file : null, listening: listening ? listening.absPath : null };
}

// actionId changes when the player chooses, restarts or steps back. Editing the story replays the
// same turn again, and its sound effects must not play over and over while the writer types.
function handleTags(tags, isLiveTurn, actionId) {
    noteTags(tags);
    if( actionId !== soundsPlayedFor ) { soundsPlayedFor = actionId; soundsPlayed.clear(); }
    (tags || []).forEach(tag => {
        const parsed = parseAudioTag(tag);
        if( !parsed ) return;
        if( parsed.kind === "sound" && parsed.stop ) {
            stopSoundEffects();
            return;
        }
        // Empty or malformed references are inert while the writer edits a tag.
        // Only explicit stop commands may stop an otherwise playing track/effect.
        if( Object.prototype.hasOwnProperty.call(parsed, "invalid") ) {
            if( parsed.invalid )
                warnOnce(`#${parsed.kind}: "${parsed.invalid}" is not a valid audio file reference. Use an audio filename or project-relative path (mp3, ogg, wav...).`);
            return;
        }
        if( parsed.kind === "music" ) {
            sawMusicTag = true;
            wantedMusic = parsed.file === null ? null : { file: parsed.file, kind: "music" };
            if( !wantedMusic ) stopMusic();
            else {
                const resolved = resolveRequest(wantedMusic, !music || music.file !== parsed.file);
                if( resolved && (!music || music.url !== resolved.url) ) startMusic(wantedMusic, resolved);
                // A missing replacement must not silence a still-valid current track.
                // If the *playing* file itself disappeared, stop it (also checked by
                // refreshAvailability when the project file watcher reports the change).
                else if( !resolved && music && music.file === parsed.file ) {
                    warnOnce(`Sound file removed, music stopped: ${parsed.file}`);
                    stopMusic();
                }
            }
        } else if( isLiveTurn ) {
            const key = soundCounter++ + "|" + parsed.file;
            if( !soundsPlayed.has(key) ) {
                soundsPlayed.add(key);
                const request = { file: parsed.file, kind: "sound" };
                playSound(request, resolveRequest(request));
            }
        }
    });
}

function applyVolume() {
    if( music ) music.element.volume = volumeFor("music");
    fadingMusic.forEach((fade, element) => { element.volume = volumeFor("music") * fade.factor; });
    sounds.forEach((sound, element) => { element.volume = volumeFor(sound.category); });
    if( listening ) listening.element.volume = previewFileVolume();
}

// game.yaml changed (initial volume, Master, Music or SFX): active players take the new levels.
function refreshVolume() {
    const baseChanged = syncBase();
    applyVolume();
    if( baseChanged ) notifyControl();
}

// ---- The volume row of the menu -------------------------------------------

// What the menu shows: whether a valid story audio source is currently active,
// the slider position and whether the listener has muted it.
function getControlState() {
    syncBase();
    return {
        available: sawAudioTag,
        level: muted ? 0 : Math.round(level * 100),
        silent: muted || level === 0
    };
}

function notifyControl() {
    if( controlListener ) controlListener(getControlState());
}

function setControlListener(listener) {
    controlListener = listener;
}

// The slider moved (0..100). Players that are already sounding change at once.
function setLevel(percent) {
    syncBase();
    level = clampVolume(Number(percent) / 100);
    muted = false;
    if( level > 0 ) lastAudible = level;
    applyVolume();
    notifyControl();
}

// The speaker button: silence everything, or bring back the last audible level.
function toggleMute() {
    syncBase();
    if( muted || level === 0 ) {
        muted = false;
        if( level === 0 ) level = lastAudible;
    } else {
        muted = true;
    }
    applyVolume();
    notifyControl();
}

// Once a referenced file has been resolved and started, its own source path determines
// availability. A valid but inactive tag does not keep the slider on screen.
function refreshReferencedAudioControl() {
    // The source of truth is the file the player has *actually started*, not every tag
    // observed in earlier scenes. This also handles overlapping music and sound effects.
    const playable = sourcePath => !!sourcePath && fs.existsSync(sourcePath);
    const available = (music && playable(music.sourcePath)) ||
        Array.from(fadingMusic.values()).some(fade => playable(fade.sourcePath)) ||
        Array.from(sounds.values()).some(sound => playable(sound.sourcePath));
    if( available !== sawAudioTag ) {
        sawAudioTag = available;
        notifyControl();
    }
}

function noteTags(tags) {
    let changed = false;
    (tags || []).forEach(tag => {
        const parsed = parseAudioTag(tag);
        if( !parsed || !parsed.file ) return; // stops and invalid references have no media
        const key = parsed.kind + "\u0000" + parsed.file;
        if( referencedAudio.has(key) ) return;
        referencedAudio.set(key, { kind: parsed.kind, file: parsed.file });
        changed = true;
    });
    if( changed ) refreshReferencedAudioControl();
}

// Listening to a sound file from the Explorer: click to play, click again to stop.
let listening = null;   // { absPath, element, onChange }

function stopListening() {
    if( !listening ) return;
    const current = listening;
    listening = null;
    current.element.pause();
    current.element.removeAttribute("src");
    current.element.load();
    if( current.onChange ) current.onChange(false);
}

function stopSoundEffects() {
    sounds.forEach((sound, element) => {
        element.pause();
        element.removeAttribute("src");
        element.load();
    });
    sounds.clear();
    refreshReferencedAudioControl();
}

// onChange(true|false) tells the caller whether this file is playing, also when it ends by itself.
function togglePreviewFile(absPath, onChange) {
    const sameFile = listening && listening.absPath === absPath;
    stopListening();
    if( sameFile ) return;
    const element = new Audio(pathToFileURL(absPath).href);
    element.volume = previewFileVolume();
    const entry = { absPath: absPath, element: element, onChange: onChange };
    listening = entry;
    const finished = () => { if( listening === entry ) stopListening(); };
    element.addEventListener("ended", finished);
    element.addEventListener("error", () => {
        warnOnce(`This sound file could not be played: ${absPath}`);
        finished();
    });
    if( onChange ) onChange(true);
    const attempt = element.play();
    if( attempt && attempt.catch ) attempt.catch(finished);
}

function stopAll() {
    stopMusic();
    stopListening();
    stopSoundEffects();
}

exports.AudioPreview = {
    configure: configure,
    beginPlaythrough: beginPlaythrough,
    endReplay: endReplay,
    handleTags: handleTags,
    refreshVolume: refreshVolume,
    noteTags: noteTags,
    getControlState: getControlState,
    setControlListener: setControlListener,
    setLevel: setLevel,
    toggleMute: toggleMute,
    stopSoundEffects: stopSoundEffects,
    refreshAvailability: refreshAvailability,
    getState: getState,
    togglePreviewFile: togglePreviewFile,
    stopListening: stopListening,
    stopAll: stopAll
};
