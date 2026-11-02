const assert = require("assert");
const { JSDOM } = require("jsdom");

const PLAYER = '<div id="player" data-story-title="O Farol" data-story-author="Clara Santos">' +
    '<div class="scrollContainer">' +
    '<div class="innerText active"><p class="storyText">The train arrives.</p></div>' +
    '<div class="hiddenBuffer"><div class="innerText"><p class="storyText">Old turn</p></div></div>' +
    '</div></div>';

// The chrome keeps module state for the player it was installed on, so each test gets a fresh copy.
function withChrome(html, run) {
    const dom = new JSDOM(html);
    const previous = { window: global.window, document: global.document };
    const chromePath = require.resolve("../renderer/gameChrome.js");
    global.window = dom.window;
    global.document = dom.window.document;
    delete require.cache[chromePath];
    try {
        return run(require("../renderer/gameChrome.js").GameChrome, dom.window);
    } finally {
        delete require.cache[chromePath];
        Object.keys(previous).forEach(key => {
            if( previous[key] === undefined ) delete global[key];
            else global[key] = previous[key];
        });
        dom.window.close();
    }
}

describe("game chrome", function () {
    it("builds the same single menu the exported page has, without repeating the title and author", function () {
        withChrome(PLAYER, (GameChrome, window) => {
            const player = window.document.getElementById("player");
            GameChrome.sync(player);

            const hud = player.querySelector(".innerText.active .story-hud");
            assert.ok(hud);
            assert.strictEqual(hud.id, "controls");
            assert.strictEqual(player.querySelector(".innerText.active").firstElementChild, hud);
            // The title and the author live on the title screen only.
            assert.strictEqual(hud.querySelector(".story-identity, .story-identity-title, .story-identity-author"), null);
            assert.strictEqual(hud.textContent.includes("O Farol"), false);
            assert.strictEqual(hud.textContent.includes("Clara Santos"), false);
            assert.strictEqual(player.querySelector(".innerText.active").textContent.includes("Clara Santos"), false);
            assert.strictEqual(hud.querySelectorAll(".story-actions").length, 1);
            assert.ok(hud.querySelector("#menu-toggle"));
            assert.ok(hud.querySelector("#story-menu[hidden]"));
            ["rewind", "save", "reload"].forEach(id =>
                assert.strictEqual(hud.querySelectorAll("#story-menu #" + id).length, 1, id));
            // The audio controls live in the same place as the export, but stay hidden in the editor.
            assert.ok(hud.querySelector("#audio-settings-anchor[hidden]"));
            assert.strictEqual(player.querySelectorAll("#menu-toggle").length, 1);
            assert.ok(player.querySelector(".scroll-cue"));
        });
    });

    it("uses one menu: opens, closes, and runs each action once", function () {
        withChrome(PLAYER, (GameChrome, window) => {
            const events = [];
            const player = window.document.getElementById("player");
            GameChrome.setup(player, {
                onRestart: () => events.push("restart"),
                onSave: () => events.push("save"),
                onLoad: () => events.push("load")
            });
            GameChrome.sync(player);

            const toggle = player.querySelector("#menu-toggle");
            const menu = player.querySelector("#story-menu");
            toggle.click();
            assert.strictEqual(menu.hidden, false);
            assert.strictEqual(toggle.getAttribute("aria-expanded"), "true");
            toggle.click();
            assert.strictEqual(menu.hidden, true);
            assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");

            // Load is disabled until something was saved
            assert.strictEqual(player.querySelector("#reload").disabled, true);

            toggle.click();
            player.querySelector("#save").click();
            assert.deepStrictEqual(events, ["save"]);
            assert.strictEqual(menu.hidden, true, "choosing an action closes the menu");
            // the host reports the new save, as the controller does after recording the choices
            GameChrome.setSaveAvailable(true);
            assert.strictEqual(player.querySelector("#reload").disabled, false);

            toggle.click();
            player.querySelector("#reload").click();
            toggle.click();
            player.querySelector("#rewind").click();
            assert.deepStrictEqual(events, ["save", "load", "restart"]);

            // Escape closes the menu and gives focus back to its button
            toggle.click();
            window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            assert.strictEqual(menu.hidden, true);
            assert.strictEqual(window.document.activeElement, toggle);

            // A click anywhere outside the player closes it too
            toggle.click();
            window.document.body.click();
            assert.strictEqual(menu.hidden, true);

            toggle.click();
            player.querySelector(".storyText").click();
            assert.strictEqual(menu.hidden, true, "clicking the story closes the menu");
            assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");
        });
    });

    it("keeps the menu closed while the title screen is up and follows the visible frame", function () {
        withChrome(PLAYER, (GameChrome, window) => {
            const player = window.document.getElementById("player");
            GameChrome.setup(player, {});
            GameChrome.sync(player);
            const first = player.querySelector(".innerText.active");
            first.querySelector("#menu-toggle").click();
            assert.strictEqual(player.querySelector("#story-menu").hidden, false);

            // the Preview swaps its buffers: the chrome moves to the new visible frame
            const hidden = player.querySelector(".hiddenBuffer .innerText");
            first.classList.remove("active");
            first.classList.add("title-screen-active");
            hidden.classList.add("active");
            GameChrome.sync(player);

            assert.strictEqual(player.querySelectorAll(".story-hud").length, 1);
            assert.strictEqual(hidden.firstElementChild.className, "story-hud");
            assert.strictEqual(player.querySelectorAll(".scroll-cue").length, 1);
            assert.strictEqual(hidden.querySelector("#story-menu").hidden, true, "the menu does not follow the old frame open");
            assert.strictEqual(player.querySelector(".title-screen-active .story-hud"), null);
        });
    });

    it("hides the chrome when controls.show is off", function () {
        withChrome(
            '<div id="player" data-controls-show="0"><div class="innerText active"></div></div>',
            (GameChrome, window) => {
                const player = window.document.getElementById("player");
                GameChrome.sync(player);
                assert.strictEqual(player.classList.contains("game-controls-hidden"), true);
                const frame = player.querySelector(".innerText.active");
                assert.ok(frame.querySelector(".story-hud"));
                assert.strictEqual(frame.querySelector(".story-identity-title"), null);
            }
        );
    });
    describe("volume row", function () {
        function row(player) {
            return {
                anchor: player.querySelector("#audio-settings-anchor"),
                control: player.querySelector("#audio-control"),
                slider: player.querySelector("#audio-volume"),
                toggle: player.querySelector("#audio-toggle")
            };
        }

        it("stays hidden until the story is known to use sound, then shows in the same menu", function () {
            withChrome(PLAYER, (GameChrome, window) => {
                const player = window.document.getElementById("player");
                GameChrome.sync(player);
                assert.strictEqual(row(player).anchor.hidden, true);

                GameChrome.setup(player, {});
                GameChrome.setAudioState({ available: true, level: 40, silent: false });
                const { anchor, control, slider } = row(player);
                assert.strictEqual(anchor.hidden, false);
                assert.strictEqual(control.hidden, false);
                assert.strictEqual(slider.value, "40");
                assert.ok(player.querySelector("#story-menu #audio-settings-anchor"), "inside the story menu");
                assert.strictEqual(player.querySelectorAll("#audio-volume").length, 1);
                assert.strictEqual(player.querySelector("#audio-control label"), null);
                assert.strictEqual(slider.hasAttribute("title"), false);

                GameChrome.setAudioState({ available: false });
                assert.strictEqual(row(player).anchor.hidden, true);
            });
        });

        it("reports slider moves and the speaker button to the host, and keeps the menu open", function () {
            withChrome(PLAYER, (GameChrome, window) => {
                const calls = [];
                const player = window.document.getElementById("player");
                GameChrome.setup(player, { onVolume: v => calls.push(["volume", v]), onToggleMute: () => calls.push(["mute"]) });
                GameChrome.sync(player);
                GameChrome.setAudioState({ available: true, level: 50, silent: false });
                player.querySelector("#menu-toggle").click();
                const { slider, toggle } = row(player);

                slider.value = "65";
                slider.dispatchEvent(new window.Event("input", { bubbles: true }));
                toggle.click();

                assert.deepStrictEqual(calls, [["volume", 65], ["mute"]]);
                assert.strictEqual(player.querySelector("#story-menu").hidden, false);
            });
        });

        it("shows the muted state and the value the host applied", function () {
            withChrome(PLAYER, (GameChrome, window) => {
                const player = window.document.getElementById("player");
                GameChrome.setup(player, {});
                GameChrome.sync(player);
                GameChrome.setAudioState({ available: true, level: 0, silent: true });
                const { control, slider, toggle } = row(player);
                assert.strictEqual(control.classList.contains("muted"), true);
                assert.strictEqual(toggle.getAttribute("aria-pressed"), "false");
                assert.strictEqual(slider.value, "0");

                GameChrome.setAudioState({ available: true, level: 70, silent: false });
                assert.strictEqual(control.classList.contains("muted"), false);
                assert.strictEqual(toggle.getAttribute("aria-pressed"), "true");
                assert.strictEqual(slider.value, "70");
            });
        });

        it("keeps its state when the menu moves to a new frame", function () {
            withChrome(PLAYER, (GameChrome, window) => {
                const player = window.document.getElementById("player");
                GameChrome.setup(player, {});
                GameChrome.sync(player);
                GameChrome.setAudioState({ available: true, level: 33, silent: false });
                const first = player.querySelector(".innerText.active");
                const hidden = player.querySelector(".hiddenBuffer .innerText");
                first.classList.remove("active");
                hidden.classList.add("active");
                GameChrome.sync(player);

                assert.strictEqual(player.querySelectorAll("#audio-volume").length, 1);
                assert.strictEqual(hidden.querySelector("#audio-volume").value, "33");
                assert.strictEqual(hidden.querySelector("#audio-settings-anchor").hidden, false);
            });
        });
    });
});
