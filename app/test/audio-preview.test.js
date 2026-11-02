const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AudioPreview } = require("../renderer/audioPreview.js");

describe("Audio preview", function () {
    let projectDir;
    let volume;
    let base;
    let mix;
    let previousAudio;
    let players;

    class MockAudio {
        constructor(src) {
            this.src = src;
            this.volume = 1;
            this.loop = false;
            this.listeners = {};
            this.paused = false;
            this.playCount = 0;
            players.push(this);
        }

        addEventListener(name, listener) {
            this.listeners[name] = listener;
        }

        play() {
            this.paused = false;
            this.playCount++;
            return Promise.resolve();
        }

        pause() {
            this.paused = true;
        }

        removeAttribute(name) {
            if( name === "src" ) this.src = "";
        }

        load() {}
    }

    beforeEach(function () {
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "inky-audio-preview-"));
        fs.mkdirSync(path.join(projectDir, "audio"));
        fs.mkdirSync(path.join(projectDir, "effects"));
        fs.writeFileSync(path.join(projectDir, "audio", "music.mp3"), "");
        fs.writeFileSync(path.join(projectDir, "audio", "branch.ogg"), "");
        fs.writeFileSync(path.join(projectDir, "effects", "branch.ogg"), "");
        volume = 0.25;
        base = 1;
        mix = { master: 1, music: 1, sfx: 1 };
        players = [];
        previousAudio = global.Audio;
        global.Audio = MockAudio;
        AudioPreview.configure({
            getProjectDir: () => projectDir,
            getBaseVolume: () => base,
            getVolume: category => volume * mix.master * (category === "music" ? mix.music : mix.sfx)
        });
        AudioPreview.setControlListener(null);
    });

    afterEach(function () {
        AudioPreview.stopAll();
        global.Audio = previousAudio;
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it("ignores the retired audio and audioloop tags", function () {
        AudioPreview.handleTags(["audio: effects/branch.ogg"], true, 1);
        AudioPreview.handleTags(["audioloop: audio/music.mp3", "audioloop: stop"], true, 2);
        assert.strictEqual(players.length, 0);
        assert.strictEqual(AudioPreview.getState().music, null);
        AudioPreview.noteTags(["audio: effects/branch.ogg", "audioloop: audio/music.mp3"]);
        assert.strictEqual(AudioPreview.getControlState().available, false);
    });

    it("applies updated initial volume to active music, effects, and Explorer playback", function () {
        AudioPreview.handleTags(["music: music.mp3"], true, 1);
        AudioPreview.handleTags(["sound: branch.ogg"], true, 1);
        AudioPreview.togglePreviewFile(path.join(projectDir, "effects", "branch.ogg"));
        assert.strictEqual(players.length, 3);

        volume = 0.7;
        AudioPreview.refreshVolume();
        assert.deepStrictEqual(players.map(player => player.volume), [0.7, 0.7, 0.7]);
    });

    it("multiplies Master and category levels and updates active players without restarting", function () {
        volume = 1;
        mix = { master: 0.5, music: 0.11, sfx: 0.18 };
        AudioPreview.handleTags(["music: music.mp3", "sound: branch.ogg"], true, 1);
        const music = players[0];
        const effect = players[1];
        assert.strictEqual(music.volume, 0.055);
        assert.strictEqual(effect.volume, 0.09);

        mix = { master: 0.8, music: 0.25, sfx: 0.5 };
        AudioPreview.refreshVolume();
        assert.strictEqual(players.length, 2);
        assert.strictEqual(music.volume, 0.2);
        assert.strictEqual(effect.volume, 0.4);
        assert.strictEqual(music.paused, false);
        assert.strictEqual(effect.paused, false);
        assert.strictEqual(music.playCount, 1);
        assert.strictEqual(effect.playCount, 1);
    });

    it("updates music that is fading out when the mix changes", async function () {
        volume = 0.4;
        AudioPreview.handleTags(["music: music.mp3"], true, 1);
        const outgoing = players[0];
        AudioPreview.handleTags(["music: branch.ogg"], true, 2);

        volume = 0.2;
        AudioPreview.refreshVolume();
        assert.strictEqual(outgoing.volume, 0.2);
        await new Promise(resolve => setTimeout(resolve, 550));
        assert.strictEqual(outgoing.paused, true);
    });

    it("stops all effects without stopping music", function () {
        AudioPreview.handleTags(["music: music.mp3", "sound: branch.ogg", "sound: effects/branch.ogg"], true, 1);
        const music = players[0];
        const effects = players.slice(1);

        AudioPreview.handleTags(["sound: stop"], true, 2);

        assert.ok(effects.every(effect => effect.paused && effect.src === ""));
        assert.strictEqual(music.paused, false);
        assert.strictEqual(AudioPreview.getState().music, "music.mp3");
    });

    it("stops active effects when the sound tag has an incomplete extension", function () {
        AudioPreview.handleTags(["sound: branch.ogg"], true, 1);
        const effect = players[0];

        AudioPreview.handleTags(["sound: fire.mp"], true, 2);

        assert.strictEqual(effect.paused, true);
        assert.strictEqual(effect.src, "");
    });

    it("replays choice music tags without replaying one-shot effects", function () {
        AudioPreview.beginPlaythrough();
        AudioPreview.handleTags(["music: music.mp3", "sound: branch.ogg"], false, 1);
        AudioPreview.endReplay();

        assert.strictEqual(players.length, 1);
        assert.strictEqual(players[0].loop, true);
        assert.strictEqual(AudioPreview.getState().music, "music.mp3");
    });

    it("stops an active effect when its source file is removed", function () {
        AudioPreview.handleTags(["sound: branch.ogg"], true, 1);
        const effect = players[0];

        fs.rmSync(path.join(projectDir, "audio", "branch.ogg"), { force: true });
        fs.rmSync(path.join(projectDir, "effects", "branch.ogg"));
        AudioPreview.refreshAvailability();

        assert.strictEqual(effect.paused, true);
        assert.strictEqual(effect.src, "");
    });

    it("restarts the requested music when its file is restored", async function () {
        AudioPreview.handleTags(["music: music.mp3"], true, 1);
        const original = players[0];

        fs.rmSync(path.join(projectDir, "audio", "music.mp3"));
        AudioPreview.refreshAvailability();
        assert.strictEqual(AudioPreview.getState().music, null);

        fs.writeFileSync(path.join(projectDir, "audio", "music.mp3"), "");
        AudioPreview.refreshAvailability();
        assert.strictEqual(AudioPreview.getState().music, "music.mp3");
        assert.strictEqual(players.length, 2);
        await new Promise(resolve => setTimeout(resolve, 550));
        assert.strictEqual(original.paused, true);
    });
    describe("volume controls of the story menu", function () {
        let states;

        beforeEach(function () {
            states = [];
            // "volume" is the fixed Master x category part here; "base" is the initial volume.
            volume = 1;
            base = 0.5;
            AudioPreview.configure({ getBaseVolume: () => base });
            AudioPreview.setControlListener(state => states.push(state));
            AudioPreview.handleTags([], true, -1);   // forget the effects of earlier tests
            AudioPreview.beginPlaythrough();
        });

        afterEach(function () {
            AudioPreview.setControlListener(null);
        });

        it("keeps the controls hidden for a story without sound tags", function () {
            AudioPreview.handleTags(["title: A praia", "image: hero.jpg"], true, 1);
            AudioPreview.noteTags(["clean"]);
            AudioPreview.endReplay();
            assert.strictEqual(AudioPreview.getControlState().available, false);
            assert.strictEqual(states.length, 0);
        });

        it("shows them for music only, for sound effects only, and for both", function () {
            AudioPreview.handleTags(["music: music.mp3"], true, 1);
            assert.strictEqual(AudioPreview.getControlState().available, true);

            AudioPreview.beginPlaythrough();
            AudioPreview.noteTags([]);
            AudioPreview.endReplay();
            assert.strictEqual(AudioPreview.getControlState().available, false, "the tags are gone, so are the controls");

            AudioPreview.handleTags(["sound: branch.ogg"], true, 1);
            assert.strictEqual(AudioPreview.getControlState().available, true);

            AudioPreview.handleTags(["music: music.mp3"], true, 2);
            assert.strictEqual(AudioPreview.getControlState().available, true);
        });

        it("recognizes a music stop and a name that is not a sound file, not the retired tags", function () {
            ["music: stop", "sound: stop", "music: ../x"].forEach(tag => {
                AudioPreview.beginPlaythrough();
                AudioPreview.endReplay();
                assert.strictEqual(AudioPreview.getControlState().available, false, tag + " (reset)");
                AudioPreview.noteTags([tag]);
                assert.strictEqual(AudioPreview.getControlState().available, true, tag);
            });
            AudioPreview.beginPlaythrough();
            AudioPreview.endReplay();
            AudioPreview.noteTags(["audio: effects/branch.ogg", "audioloop: audio/music.mp3"]);
            assert.strictEqual(AudioPreview.getControlState().available, false);
        });

        it("appears when a later passage reaches sound and does not flicker while the story replays", function () {
            AudioPreview.noteTags(["music: music.mp3"]);
            AudioPreview.endReplay();
            const before = states.length;

            AudioPreview.beginPlaythrough();            // the writer typed: recompile and replay
            assert.strictEqual(AudioPreview.getControlState().available, true, "still shown during the replay");
            AudioPreview.noteTags(["music: music.mp3"]);
            AudioPreview.endReplay();
            assert.strictEqual(states.length, before, "no hide/show notifications");
            assert.strictEqual(AudioPreview.getControlState().available, true);
        });

        it("starts the slider at the initial volume of game.yaml", function () {
            assert.deepStrictEqual(
                { level: AudioPreview.getControlState().level, silent: AudioPreview.getControlState().silent },
                { level: 50, silent: false });
        });

        it("applies the slider to active music and effects at once, and to players created later", function () {
            mix = { master: 0.5, music: 0.8, sfx: 0.4 };
            AudioPreview.handleTags(["music: music.mp3", "sound: branch.ogg"], true, 1);
            const music = players[0];
            const effect = players[1];
            assert.strictEqual(music.volume, 0.5 * 0.5 * 0.8);
            assert.strictEqual(effect.volume, 0.5 * 0.5 * 0.4);

            AudioPreview.setLevel(100);
            assert.strictEqual(music.volume, 0.5 * 0.8);
            assert.strictEqual(effect.volume, 0.5 * 0.4);
            assert.strictEqual(music.playCount, 1, "the music is not restarted");

            AudioPreview.setLevel(20);
            AudioPreview.handleTags(["sound: branch.ogg"], true, 2);
            assert.strictEqual(players[2].volume, 0.2 * 0.5 * 0.4, "a new player takes the current slider value");
            AudioPreview.handleTags(["music: branch.ogg"], true, 3);
            assert.strictEqual(players[3].volume, 0.2 * 0.5 * 0.8);
            assert.strictEqual(AudioPreview.getControlState().level, 20, "the shown value is the applied one");
        });

        it("does not multiply Master by itself: one level per channel", function () {
            mix = { master: 0.5, music: 1, sfx: 1 };
            AudioPreview.setLevel(80);
            AudioPreview.handleTags(["music: music.mp3", "sound: branch.ogg"], true, 1);
            assert.strictEqual(players[0].volume, 0.8 * 0.5);
            assert.strictEqual(players[1].volume, 0.8 * 0.5);
        });

        it("mutes and restores with the speaker button, music keeps playing", function () {
            AudioPreview.handleTags(["music: music.mp3", "sound: branch.ogg"], true, 1);
            const music = players[0];
            const effect = players[1];
            AudioPreview.setLevel(60);

            AudioPreview.toggleMute();
            assert.strictEqual(music.volume, 0);
            assert.strictEqual(effect.volume, 0);
            assert.strictEqual(music.paused, false);
            assert.deepStrictEqual(
                { level: AudioPreview.getControlState().level, silent: AudioPreview.getControlState().silent },
                { level: 0, silent: true });

            AudioPreview.toggleMute();
            assert.strictEqual(music.volume, 0.6);
            assert.strictEqual(AudioPreview.getControlState().level, 60);

            AudioPreview.setLevel(0);
            assert.strictEqual(AudioPreview.getControlState().silent, true);
            AudioPreview.toggleMute();
            assert.strictEqual(music.volume, 0.6, "from zero the button brings back the last audible level");
        });

        it("a slider at zero silences the effects but leaves the other channel settings alone", function () {
            mix = { master: 1, music: 0.5, sfx: 1 };
            AudioPreview.handleTags(["music: music.mp3", "sound: branch.ogg"], true, 1);
            AudioPreview.setLevel(0);
            assert.strictEqual(players[0].volume, 0);
            AudioPreview.setLevel(100);
            assert.strictEqual(players[0].volume, 0.5, "music category level was kept");
            assert.strictEqual(players[1].volume, 1, "effects category level was kept");
        });

        it("keeps the player's choice across replays and turns", function () {
            AudioPreview.setLevel(30);
            AudioPreview.beginPlaythrough();
            AudioPreview.handleTags(["music: music.mp3"], true, 1);
            AudioPreview.endReplay();
            AudioPreview.handleTags(["sound: branch.ogg"], true, 2);
            assert.strictEqual(AudioPreview.getControlState().level, 30);
            assert.strictEqual(players[0].volume, 0.3);
            assert.strictEqual(players[1].volume, 0.3);
        });

        it("restarts the slider when the writer changes the initial volume in game.yaml, not for other changes", function () {
            AudioPreview.handleTags(["music: music.mp3"], true, 1);
            AudioPreview.setLevel(30);

            mix = { master: 0.5, music: 1, sfx: 1 };      // Master changed: the player's slider stays
            AudioPreview.refreshVolume();
            assert.strictEqual(AudioPreview.getControlState().level, 30);
            assert.strictEqual(players[0].volume, 0.15);

            base = 0.9;                                    // initial volume changed
            AudioPreview.refreshVolume();
            assert.strictEqual(AudioPreview.getControlState().level, 90);
            assert.strictEqual(players[0].volume, 0.45);
            assert.strictEqual(states[states.length - 1].level, 90, "the menu is told");
        });

        it("tells the menu about every change", function () {
            AudioPreview.noteTags(["sound: branch.ogg"]);
            AudioPreview.setLevel(70);
            AudioPreview.toggleMute();
            assert.deepStrictEqual(states.map(state => [state.available, state.level, state.silent]), [
                [true, 50, false],
                [true, 70, false],
                [true, 0, true]
            ]);
        });

        it("keeps Explorer playback on the initial volume, whatever the slider says", function () {
            AudioPreview.setLevel(10);
            AudioPreview.toggleMute();
            AudioPreview.togglePreviewFile(path.join(projectDir, "effects", "branch.ogg"));
            assert.strictEqual(players[0].volume, 0.5);
        });
    });
});
