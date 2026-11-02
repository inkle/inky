"use strict";

// Game chrome: the single menu that floats over the story frame. The title and the author
// belong to the title screen only; they are not repeated while the story is played.
// The web export template uses the same markup and the same ids; the Preview inserts it into
// the visible frame and moves it when the compiler swaps buffers. Behaviour that only exists
// in one environment (the export's saved game, the Preview's replay) is supplied by callbacks
// from the host, so the markup and the menu never fork.

const InkyPager = require("./pager.js");

const MENU_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const REWIND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11a7.5 7.5 0 1 1 .8 4.7M4.5 5.5V11H10"/></svg>';
const SAVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.75h12a1 1 0 0 1 1 1v15.5l-7-4.25-7 4.25V4.75a1 1 0 0 1 1-1Z"/></svg>';
const THEME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/></svg>';
const AUDIO_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor"/><path class="wave" d="M10.3 5.7a3.3 3.3 0 0 1 0 4.6"/><path class="wave" d="M12 4a5.6 5.6 0 0 1 0 8"/><path class="slash" d="M10.5 6l4 4M14.5 6l-4 4"/></svg>';

function hudHtml() {
    return '<header id="controls" class="story-hud">' +
        '<div class="story-actions">' +
        '<div class="toolbar-popover-anchor">' +
        '<button type="button" id="menu-toggle" class="toolbar-icon-button" aria-label="Story menu" aria-expanded="false" aria-controls="story-menu" title="Story menu">' + MENU_ICON + '</button>' +
        '<div id="story-menu" class="toolbar-popover" hidden>' +
        '<button type="button" id="rewind" title="Restart story" aria-label="Restart story">' + REWIND_ICON + '<span>Restart story</span></button>' +
        '<button type="button" id="save" title="Save progress" aria-label="Save progress">' + SAVE_ICON + '<span>Save progress</span></button>' +
        '<button type="button" id="reload" title="Reload from save point" aria-label="Load saved progress">' + REWIND_ICON + '<span>Load saved progress</span></button>' +
        '<button type="button" id="theme-toggle" title="Change theme" aria-label="Change theme" hidden>' + THEME_ICON + '<span>Dark theme</span></button>' +
        '<div id="audio-settings-anchor" hidden>' +
        '<span id="audio-control" class="audio-control" hidden>' +
        '<button type="button" id="audio-toggle" title="Sound on/off" aria-label="Sound on/off">' + AUDIO_ICON + '</button>' +
        '<input type="range" id="audio-volume" min="0" max="100" step="1" value="50" aria-label="Volume">' +
        '</span>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</header>';
}

function scrollCueHtml() {
    return '<div class="scroll-cue" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9.5 12 15l6-5.5"/></svg></div>';
}

function directChild(element, className) {
    for( let child = element.firstElementChild; child; child = child.nextElementSibling ) {
        if( child.classList.contains(className) ) return child;
    }
    return null;
}

// The frame owns the picture band, the scrolling passage and the choices footer that stays
// at the bottom of the frame. Older preview markup (and the test fixtures) only had the
// paragraph buffer, so existing children move into the passage.
function ensureStructure(frame) {
    if( !frame || !frame.classList ) return null;
    frame.classList.add("container");
    let visual = directChild(frame, "story-visual");
    if( !visual ) {
        visual = frame.ownerDocument.createElement("div");
        visual.className = "story-visual";
        visual.hidden = true;
        frame.insertBefore(visual, frame.firstChild);
    }
    let passage = directChild(frame, "story-passage");
    if( !passage ) {
        passage = frame.ownerDocument.createElement("div");
        passage.className = "story-passage";
        Array.from(frame.childNodes).forEach(node => {
            if( node === visual || node.nodeType !== 1 ) return;
            if( node.classList.contains("story-hud") || node.classList.contains("scroll-cue") ||
                node.classList.contains("title-screen") ) return;
            passage.appendChild(node);
        });
        frame.appendChild(passage);
    }
    // The page navigation sits between the passage and the choices (see pager.js).
    let pager = directChild(frame, "story-pager");
    if( !pager ) {
        pager = InkyPager.navElement(frame.ownerDocument);
        passage.insertAdjacentElement("afterend", pager);
    }
    if( !directChild(frame, "story-choices") ) {
        const choices = frame.ownerDocument.createElement("div");
        choices.className = "story-choices";
        choices.hidden = true;
        pager.insertAdjacentElement("afterend", choices);
    }
    return passage;
}

function pagerIn(frame) {
    if( !frame ) return null;
    ensureStructure(frame);
    return directChild(frame, "story-pager");
}

function choicesIn(frame) {
    if( !frame ) return null;
    ensureStructure(frame);
    return directChild(frame, "story-choices");
}

function createHud(frame) {
    const holder = frame.ownerDocument.createElement("div");
    holder.innerHTML = hudHtml();
    return holder.firstElementChild;
}

function createScrollCue(frame) {
    const holder = frame.ownerDocument.createElement("div");
    holder.innerHTML = scrollCueHtml();
    return holder.firstElementChild;
}

function activeFrame(player) {
    return player ? player.querySelector(".innerText.active") : null;
}

let installedFor = null;
let actions = {};
// What the menu's volume row shows. The host (the Preview) supplies it; the row stays hidden
// until the story is known to use sound, as in the exported page.
let audioState = { available: false, level: 50, silent: false };

function closeMenu(player) {
    const panel = player.querySelector("#story-menu");
    const toggle = player.querySelector("#menu-toggle");
    if( panel ) panel.hidden = true;
    if( toggle ) toggle.setAttribute("aria-expanded", "false");
}

function hasSaved(available) {
    return typeof available === "function" ? !!available() : !!available;
}

function applyAudio(hud) {
    const anchor = hud.querySelector("#audio-settings-anchor");
    const control = hud.querySelector("#audio-control");
    if( anchor ) anchor.hidden = !audioState.available;
    if( control ) {
        control.hidden = !audioState.available;
        control.classList.toggle("muted", !!audioState.silent);
    }
    const toggle = hud.querySelector("#audio-toggle");
    if( toggle ) toggle.setAttribute("aria-pressed", String(!audioState.silent));
    const slider = hud.querySelector("#audio-volume");
    if( slider && slider.value !== String(audioState.level) ) slider.value = String(audioState.level);
}

// The switch shows only when the writer allowed it, and names the theme it leads to
function applyThemeToggle(player, hud) {
    const button = hud.querySelector("#theme-toggle");
    if( !button ) return;
    const on = player.dataset.themeToggle === "1";
    button.hidden = !on;
    if( !on ) return;
    const target = player.dataset.themeTarget === "dark" ? "dark" : "light";
    const label = target === "dark" ? "Dark theme" : "Light theme";
    const text = button.querySelector("span");
    if( text && text.textContent !== label ) text.textContent = label;
    button.title = label;
    button.setAttribute("aria-label", "Change to " + label.toLowerCase());
}

function sync(player) {
    if( !player ) return;
    const frame = activeFrame(player);
    if( !frame ) return;
    ensureStructure(frame);

    let hud = player.querySelector(".story-hud");
    if( !hud ) hud = createHud(frame);
    if( hud.parentElement !== frame || frame.firstElementChild !== hud ) frame.insertBefore(hud, frame.firstElementChild);

    let cue = player.querySelector(".scroll-cue");
    if( !cue ) cue = createScrollCue(frame);
    if( cue.parentElement !== frame ) frame.appendChild(cue);

    player.classList.toggle("game-controls-hidden", player.dataset.controlsShow === "0");

    const reload = hud.querySelector("#reload");
    if( reload ) reload.disabled = !hasSaved(actions.hasSave);
    applyThemeToggle(player, hud);
    applyAudio(hud);

    if( installedFor && installedFor.lastFrame && installedFor.lastFrame !== frame ) closeMenu(player);
    if( installedFor ) installedFor.lastFrame = frame;
}

function setup(player, hostActions) {
    if( !player || installedFor === player ) return;
    installedFor = player;
    actions = hostActions || {};

    player.addEventListener("click", event => {
        const target = event.target;
        // The arrow takes the reader to the end of the text.
        const cue = target.closest(".scroll-cue");
        if( cue ) {
            const cueFrame = cue.closest(".innerText");
            const cuePassage = cueFrame ? cueFrame.querySelector(".story-passage") : null;
            if( cuePassage ) {
                const reduceMotion = player.ownerDocument.defaultView.matchMedia && player.ownerDocument.defaultView.matchMedia("(prefers-reduced-motion: reduce)").matches;
                const fill = parseFloat(player.ownerDocument.defaultView.getComputedStyle(cuePassage).getPropertyValue("--story-scroll-fill")) || 0;
                cuePassage.scrollTo({ top: Math.max(0, cuePassage.scrollHeight - fill), behavior: reduceMotion ? "auto" : "smooth" });
            }
            return;
        }
        const toggle = target.closest("#menu-toggle");
        if( toggle ) {
            const panel = player.querySelector("#story-menu");
            if( !panel ) return;
            const shouldOpen = panel.hidden;
            panel.hidden = !shouldOpen;
            toggle.setAttribute("aria-expanded", String(shouldOpen));
            return;
        }
        if( !target.closest("#story-menu") ) closeMenu(player);
        if( target.closest("#audio-toggle") ) { if( actions.onToggleMute ) actions.onToggleMute(); return; }
        if( target.closest("#rewind") ) { closeMenu(player); if( actions.onRestart ) actions.onRestart(); return; }
        if( target.closest("#save") ) { closeMenu(player); if( actions.onSave ) actions.onSave(); return; }
        if( target.closest("#reload") ) { closeMenu(player); if( actions.onLoad ) actions.onLoad(); return; }
        if( target.closest("#theme-toggle") ) { closeMenu(player); if( actions.onToggleTheme ) actions.onToggleTheme(); return; }
        if( target.closest("#story-menu > button") ) closeMenu(player);
    });

    player.addEventListener("input", event => {
        const slider = event.target.closest ? event.target.closest("#audio-volume") : null;
        if( slider && actions.onVolume ) actions.onVolume(Number(slider.value));
    });

    player.ownerDocument.addEventListener("click", event => {
        if( !player.contains(event.target) ) closeMenu(player);
    });

    player.ownerDocument.addEventListener("keydown", event => {
        if( event.key !== "Escape" ) return;
        const panel = player.querySelector("#story-menu");
        if( !panel || panel.hidden ) return;
        closeMenu(player);
        const toggle = player.querySelector("#menu-toggle");
        if( toggle ) toggle.focus();
    });
}

function setSaveAvailable(available) {
    actions.hasSave = typeof available === "function" ? available : () => !!available;
    if( installedFor ) sync(installedFor);
}

function setAudioState(state) {
    audioState = Object.assign({}, audioState, state || {});
    if( installedFor ) sync(installedFor);
}

exports.GameChrome = {
    html: hudHtml,
    scrollCueHtml: scrollCueHtml,
    ensureStructure: ensureStructure,
    choicesIn: choicesIn,
    pagerIn: pagerIn,
    setup: setup,
    sync: sync,
    close: closeMenu,
    setSaveAvailable: setSaveAvailable,
    setAudioState: setAudioState
};
