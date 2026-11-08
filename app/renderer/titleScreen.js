// The title screen: a cover, the title, the author and "Start", shown inside the story's own
// frame until the player starts. The web export and the Preview use the same markup
// (titleScreenHtml) and the same stylesheet (titleScreen.css).

const START_LABEL = "Start";
const LOAD_LABEL = "Load";
const AUTHOR_PREFIX = "Written by ";

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// "Start" is a regular story choice (p.choice > button.choice-button), so it looks and behaves
// like the choices of the story. Missing data is simply left out.
function titleScreenHtml(data) {
    const title = String(data.title || "").trim();
    const author = String(data.author || "").trim();
    const coverSrc = String(data.coverSrc || "").trim();
    // The author edits an actual CSS font size in px. The default is also
    // used when opening a project with no Story Information settings.
    const requestedSize = Number(data.titleSize);
    const titleSize = Number.isFinite(requestedSize) && requestedSize >= 16 && requestedSize <= 100
        ? requestedSize : 56;
    const customSize = titleSize === 56 ? "" : ` style="--title-screen-title-size: ${titleSize}px"`;
    return `<div class="title-screen${coverSrc ? " has-cover" : ""}" id="title-screen">` +
        (coverSrc ? `<img class="title-screen-cover" src="${escapeHtml(coverSrc)}" alt="">` : "") +
        `<div class="title-screen-body">` +
        (title ? `<h1 class="title-screen-title"${customSize}>${escapeHtml(title)}</h1>` : "") +
        (author ? `<div class="title-screen-author">${escapeHtml(AUTHOR_PREFIX + author)}</div>` : "") +
        `<div class="title-screen-actions">` +
        `<p class="choice"><button type="button" class="choice-button">${START_LABEL}</button></p>` +
        `<p class="choice title-screen-load-choice"><button type="button" id="title-load" class="choice-button" disabled>${LOAD_LABEL}</button></p>` +
        `</div>` +
        `</div></div>`;
}

// ---- Preview ---------------------------------------------------------------
// The player keeps whether the story has started in data-title-started. While it has not, the
// title screen is the first child of the visible frame (.innerText.active) and covers it.

function isPending(player) {
    return !!player && player.dataset.titleStarted !== "1";
}

// Shows or removes the title screen to match the player's state. The frame element changes when
// the Preview swaps its buffers, so this runs after every swap and every style change.
function sync(player) {
    if( !player ) return;
    player.querySelectorAll(".title-screen").forEach(element => element.remove());
    player.querySelectorAll(".innerText.title-screen-active").forEach(frame => frame.classList.remove("title-screen-active"));
    if( !isPending(player) ) return;
    const frame = player.querySelector(".innerText.active");
    if( !frame ) return;
    frame.insertAdjacentHTML("afterbegin", titleScreenHtml({
        title: player.dataset.storyTitle,
        titleSize: player.dataset.storyTitleSize,
        author: player.dataset.storyAuthor,
        coverSrc: player.dataset.storyCover
    }));
    frame.classList.add("title-screen-active");
    const load = frame.querySelector("#title-load");
    if( load ) load.disabled = player.dataset.titleSaveAvailable !== "1";
}

function start(player) {
    if( !player ) return;
    player.dataset.titleStarted = "1";
    sync(player);
}

// A reset makes the title screen due again, so the story starts from its beginning behind it,
// exactly as when the project was first opened.
function reset(player) {
    if( !player ) return;
    player.dataset.titleStarted = "0";
    sync(player);
}

exports.TitleScreen = {
    START_LABEL: START_LABEL,
    html: titleScreenHtml,
    isPending: isPending,
    sync: sync,
    start: start,
    reset: reset
};
