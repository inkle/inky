const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const i18n = require('./i18n.js');
const { SafeHtml } = require('./safeHtml.js');
const InkRichText = require('./richTextDom.js');
const { isSoundTag } = require("./audioTags.js");
const { TitleScreen } = require("./titleScreen.js");
const { GameChrome } = require("./gameChrome.js");
const ChoiceText = require("./choiceText.js");
const InkyPager = require("./pager.js");
const ScreenMode = require("./screenMode.js");
const EndingMarker = require("./endingMarker.js");

var events = {};
var lastFadeTime = 0;
var $textBuffer = null;
var instructionPrefix = null;
var animationEnabled = true;
var imageResolver = () => null;
// Alignment chosen by the scene's first paragraph ("# align:" together with "# title:").
// It applies to every paragraph of that scene until the next scene starts.
var sceneAlignment = null;
// Ink repeats the selected option at the start of the next generated passage.
var selectedChoiceText = null;
// Inklecate sends paragraph text before its tags. Buffer it to apply # screen
// before painting that paragraph (not after).
var pendingStoryText = null;

// The frame (.innerText) holds the picture band and the scrolling passage; the story text lives
// in the passage. Older markup without those children is upgraded in place.
function passageIn($frame) {
    $frame.each(function() { GameChrome.ensureStructure(this); ensurePager(this); });
    var $passage = $frame.children(".story-passage").first();
    return $passage.length ? $passage : $frame;
}

// A long passage is divided into pages (see pager.js). Every frame has its own pager, made once.
function ensurePager(frame) {
    if( frame.inkyPager ) return frame.inkyPager;
    var passage = GameChrome.ensureStructure(frame);
    frame.inkyPager = InkyPager.attach({
        frame: frame,
        passage: passage,
        nav: GameChrome.pagerIn(frame),
        getChoices: function() { return GameChrome.choicesIn(frame); }
    });
    return frame.inkyPager;
}

function activePager() {
    var frame = activeFrame()[0];
    return frame ? ensurePager(frame) : null;
}

// The arrow keys, Space and Enter turn the pages of the frame on screen. A key that belongs to the
// editor, or to a control that has the focus, is left alone.
document.addEventListener("keydown", function(event) {
    var player = document.getElementById("player");
    if( !player || !(player.contains(event.target) || event.target === document.body) ) return;
    var pager = activePager();
    if( pager ) pager.handleKey(event);
});

function activeFrame() {
    return $("#player .innerText.active").first();
}

function activePassage() {
    return passageIn(activeFrame());
}

function bufferFrame() {
    var $frame = $textBuffer.closest(".innerText");
    return $frame.length ? $frame : activeFrame();
}

// Initial default: append to visible buffer
$textBuffer = activePassage();

function shouldAnimate() {
    return bufferFrame().hasClass("active");
}

function showSessionView(sessionId) {
    var $player = $("#player");

    var $hiddenContainer = $player.find(".hiddenBuffer");
    var $hidden = $hiddenContainer.find(".innerText");

    var $active = $("#player .innerText.active");
    if( $active.data("sessionId") == sessionId ) {
        return;
    }

    if( $hidden.data("sessionId") == sessionId ) {
        // Swap buffers
        $active.removeClass ("active");
        $hiddenContainer.append($active);
        $hidden.insertBefore($hiddenContainer);
        $hidden.addClass("active");

        // Also make this the active buffer
        $textBuffer = passageIn($hidden);
        TitleScreen.sync($player[0]);
        GameChrome.sync($player[0]);
        updateMoreBelow();
        // The frame only has a real height once it is on screen: the pages are decided here.
        activePager().refresh();
    }
}

function fadeIn($jqueryElement) {

    const minimumTimeSeparation = 80;
    const animDuration = 450;

    var currentTime = Date.now();
    var timeSinceLastFade = currentTime - lastFadeTime;

    var delay = 0;
    if( timeSinceLastFade < minimumTimeSeparation )
        delay = minimumTimeSeparation - timeSinceLastFade;

    $jqueryElement.css("opacity", 0);
    $jqueryElement.delay(delay).animate({opacity: 1.0}, animDuration);

    lastFadeTime = currentTime + delay;
}

// A fixed-ratio frame scrolls by itself: a new turn starts at the top of the passage,
// with extra scroll room below when the turn is too short to reach that position.
function scrollFrameToNewContent() {
    var passage = $textBuffer[0];
    if( !passage ) return;
    var paddingTop = parseFloat(window.getComputedStyle(passage).paddingTop) || 0;

    function startTop() {
        var $start = $textBuffer.children("hr").last().next();
        return $start.length ? $start[0].offsetTop : 0;
    }
    // The story's own height. scrollHeight is clamped to the viewport when the
    // text is short, and the filler must not count as story.
    function contentHeight() {
        var last = passage.lastElementChild;
        if( !last ) return 0;
        var paddingBottom = parseFloat(window.getComputedStyle(passage).paddingBottom) || 0;
        return last.offsetTop + last.offsetHeight + paddingBottom;
    }
    function fillFor(target) {
        return target > 0 ? Math.max(0, target + passage.clientHeight - contentHeight()) : 0;
    }

    var target = Math.max(0, startTop() - paddingTop);
    passage.style.setProperty("--story-scroll-fill", fillFor(target) + "px");
    // Once the filler makes the passage overflow, a short turn is no longer centred,
    // so its position is measured again before scrolling.
    target = Math.max(0, startTop() - paddingTop);
    passage.style.setProperty("--story-scroll-fill", fillFor(target) + "px");
    // The top padding covers the scrolled history, so the previous turn never
    // peeks above the new one.
    passage.style.setProperty("--story-top-cover", paddingTop + "px");

    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if( animationEnabled && !reducedMotion ) $textBuffer.animate({ scrollTop: target }, 350, "swing");
    else passage.scrollTop = target;
}

// Marks a frame that has more content below, so the CSS can fade its bottom edge
function updateMoreBelow() {
    $("#player .innerText").each(function() {
        var frame = this;
        var passage = GameChrome.ensureStructure(frame);
        var fill = passage ? parseFloat(window.getComputedStyle(passage).getPropertyValue("--story-scroll-fill")) || 0 : 0;
        var more = frame.classList.contains("active") && passage &&
            passage.scrollHeight - fill - passage.scrollTop - passage.clientHeight > 2;
        frame.classList.toggle("has-more-below", !!more);
    });
}

(function watchFrameScrolling() {
    var scrollContainer = document.querySelector("#player .scrollContainer");
    if( !scrollContainer ) return;
    // A manual scroll always wins over a running auto-scroll
    ["wheel", "touchstart", "pointerdown", "keydown"].forEach(function(type) {
        scrollContainer.addEventListener(type, function() { $("#player .innerText .story-passage").stop(true); }, { passive: true });
    });
    scrollContainer.addEventListener("scroll", updateMoreBelow, true);
    if( window.ResizeObserver ) new ResizeObserver(updateMoreBelow).observe(scrollContainer);
    // Text, pictures and choices change the height of the passage without resizing the frame
    if( window.MutationObserver ) new window.MutationObserver(updateMoreBelow).observe(document.getElementById("player"), { childList: true, subtree: true });
    // A picture in the text only knows its height once it has loaded.
    $("#player").on("load", "img", updateMoreBelow);
})();

// "Start" on the title screen. This is the one place where the Preview's story starts: the story
// becomes visible here and the controller releases the sounds it held back (events.storyStarted).
function startStory() {
    var player = document.getElementById("player");
    if( !TitleScreen.isPending(player) ) return;
    TitleScreen.start(player);
    // The Preview compiles the first passage behind the title screen. Keep its background
    // pending until Start is clicked so a scene background can never become the title cover.
    applyPendingStoryBackground(activeFrame());
    $("#player .scrollContainer, #player .innerText.active, #player .story-passage").each(function() { this.scrollTop = 0; });
    GameChrome.sync(player);
    updateMoreBelow();
    activePager().refresh();
    if( events.storyStarted ) events.storyStarted();
}

$("#player").on("click", ".title-screen .choice-button:not(#title-load)", startStory);

function isTitleScreenPending() {
    return TitleScreen.isPending(document.getElementById("player"));
}

// The "Restart story" button resets the play-through; the title screen comes back with it.
function resetTitleScreen() {
    // A restarted story returns to its title screen; never carry the last scene's background there.
    clearStoryBackground(activeFrame());
    TitleScreen.reset(document.getElementById("player"));
    GameChrome.sync(document.getElementById("player"));
}

function contentReady() {
    flushPendingStoryText();
    if( !shouldAnimate() ) {
        updateMoreBelow();
        return;
    }
    // A passage divided into pages starts at its first page: nothing scrolls.
    var pager = activePager();
    if( pager ) pager.refresh();
    if( !activeFrame().hasClass("is-paged") ) scrollFrameToNewContent();
    updateMoreBelow();
}

function prepareForNewPlaythrough(sessionId) {

    pendingStoryText = null;
    selectedChoiceText = null;
    var $frame = $("#player .hiddenBuffer .innerText");
    GameChrome.ensureStructure($frame[0]);
    // showSessionView decides what to swap by looking at the frame, so the frame
    // carries the session id as well as the passage the text is appended to.
    $frame.data("sessionId", sessionId);
    $textBuffer = passageIn($frame);
    $textBuffer.data("sessionId", sessionId);

    $textBuffer.empty();
    $textBuffer[0].scrollTop = 0;
    $textBuffer[0].style.setProperty("--story-scroll-fill", "0px");
    $textBuffer[0].style.setProperty("--story-top-cover", "0px");
    clearChoices($frame);
    clearStoryImage();
    clearStoryBackground($frame);
    $frame.removeClass("has-more-below has-visual");
    sceneAlignment = null;
}

function addTextSection(text) {
    flushPendingStoryText();
    pendingStoryText = String(text == null ? "" : text);
}

function flushPendingStoryText() {
    if( pendingStoryText === null ) return;
    const text = pendingStoryText;
    pendingStoryText = null;
    renderTextSection(text);
}

function renderTextSection(text)
{
    text = String(text == null ? "" : text);
    var choiceTextResult = ChoiceText.stripSelectedChoiceText(text, selectedChoiceText);
    text = choiceTextResult.text;
    if( choiceTextResult.consumed ) selectedChoiceText = null;
    // A selected option is navigation, not narrative content in the next screen.
    if( text.trim().length === 0 ) return;

    var $paragraph = $("<p class='storyText'></p>");

    // Game-specific instruction prefix, e.g. >>> START CAMERA: Wide shot
    if( instructionPrefix && InkRichText.plainText(text).trim().startsWith(instructionPrefix) ) {
        $paragraph.addClass("customInstruction");
    }

    // Story text is plain text: markup is shown as written, never interpreted.
    // Keep word spans only to preserve the author's Alt-click jump-to-source;
    // ordinary reading and hovering must not change narrative text styling.
    $paragraph[0].appendChild(InkRichText.toNodes(text, document));
    SafeHtml.wrapWords($paragraph[0]);
    if( sceneAlignment ) $paragraph.addClass(alignClassName(sceneAlignment));

    // Keep track of the offset of each word into the content,
    // starting from the end of the last choice (it's global in the current play session)
    var previousContentLength = 0;
    var $existingLastContent = $textBuffer.children(".storyText").last();
    if( $existingLastContent ) {
        var range = $existingLastContent.data("range");
        if( range ) {
            previousContentLength = range.start + range.length + 1; // + 1 for newline
        }
    }
    $paragraph.data("range", {start: previousContentLength, length: text.length});

    // Append the actual content
    $textBuffer.append($paragraph);

    // Find the offset of each word in the content, for clickability
    var searchFrom = 0;
    $paragraph.find("span.inky-word").each((i, element) => {
        var $span = $(element);
        var word = $span.text();
        var at = word.length > 0 ? text.indexOf(word, searchFrom) : -1;
        if( at === -1 ) return;
        $span.data("range", {start: previousContentLength + at, length: word.length});
        searchFrom = at + word.length;
    });

    // Alt-click handler to jump to source
    $paragraph.find("span.inky-word").click(function(e) {
        if( e.altKey ) {

            var range = $(this).data("range");
            if( range ) {
                var midOffset = Math.floor(range.start + range.length/2);
                events.jumpToSource(midOffset);
            }

            e.preventDefault();
        }
    });

    if( animationEnabled && shouldAnimate() )
        fadeIn($paragraph);
}

// ---- Story image -----------------------------------------------------------

var warnedImages = new Set();

function clearStoryImage($frame) {
    $frame = $frame && $frame.length ? $frame : bufferFrame();
    var $visual = $frame.children(".story-visual").first();
    if( $visual.length ) $visual.empty().prop("hidden", true);
    $frame.removeClass("has-visual");
}

function applyStoryBackground($frame, url) {
    $frame = $frame && $frame.length ? $frame : bufferFrame();
    if( !$frame.length || !url ) return;
    $frame[0].style.backgroundImage = "url(" + JSON.stringify(url) + ")";
    $frame.addClass("has-background");
}

function applyPendingStoryBackground($frame) {
    $frame = $frame && $frame.length ? $frame : activeFrame();
    if( !$frame.length ) return;
    var url = $frame.data("pendingStoryBackground");
    $frame.removeData("pendingStoryBackground");
    if( url ) applyStoryBackground($frame, url);
}

function clearStoryBackground($frame) {
    $frame = $frame && $frame.length ? $frame : bufferFrame();
    if( !$frame.length ) return;
    $frame[0].style.backgroundImage = "";
    $frame.removeClass("has-background");
    $frame.removeData("pendingStoryBackground");
}

// The first picture of a turn becomes the frame's visual panel; any further pictures stay
// in the text, exactly as in the exported page.
function showSceneImage(imageElement) {
    var $frame = bufferFrame();
    var $visual = $frame.children(".story-visual").first();
    if( !$visual.length || $frame.hasClass("has-visual") ) return false;
    $visual.empty().append(imageElement).prop("hidden", false);
    $frame.addClass("has-visual");
    return true;
}

function imageFromTag(tag) {
    var match = String(tag).trim().replace(/^#\s*/, "").match(/^image\s*:\s*(.*)$/i);
    return match && match[1].trim();
}

function addImageTag(tag) {
    var value = imageFromTag(tag);
    if( value === null || value === undefined ) return;
    var url = value ? imageResolver(value, "image") : null;
    if( !url ) {
        if( value && !warnedImages.has(value) ) {
            warnedImages.add(value);
            console.warn(`Image not found or not allowed: ${value}`);
        }
        return;
    }
    var imageElement = document.createElement("img");
    imageElement.alt = "";
    imageElement.src = url;
    if( !showSceneImage(imageElement) ) $textBuffer.append(imageElement);
}

function backgroundFromTag(tag) {
    var match = String(tag).trim().replace(/^#\s*/, "").match(/^bg\s*:\s*(.*)$/i);
    return match && match[1].trim();
}

function addBackgroundTag(tag) {
    var value = backgroundFromTag(tag);
    if( value === null || value === undefined ) return;
    var url = value ? imageResolver(value, "background") : null;
    if( !url ) {
        if( value && !warnedImages.has(value) ) {
            warnedImages.add(value);
            console.warn(`Background image not found or not allowed: ${value}`);
        }
        return;
    }
    var $frame = bufferFrame();
    if( !$frame.length ) return;
    // The frame is the background canvas. Its visual band (#image) and passage are children,
    // so they naturally render above this image without changing #image's layout or sizing.
    // During initial Preview compilation the first passage is rendered behind the title screen.
    // Defer its background until Start is clicked; otherwise it leaks into the title screen.
    if( isTitleScreenPending() ) {
        $frame.data("pendingStoryBackground", url);
        return;
    }
    applyStoryBackground($frame, url);
}

// Every passage replaces the previous one: a choice drops the narrative so far,
// its pictures and its choices before the selected branch is rendered.
function clearScene() {
    pendingStoryText = null;
    sceneAlignment = null;
    $textBuffer.children().not(".title-screen").stop(true, true).remove();
    $textBuffer[0].scrollTop = 0;
    clearChoices();
    clearStoryImage();
    clearStoryBackground();
}

function sceneTitleFromTag(tag) {
    var match = String(tag).trim().replace(/^#\s*/, "").match(/^title\s*:\s*(.*)$/i);
    return match && match[1].trim();
}

const ALIGN_CLASSES = "alignLeft alignCenter alignRight";

function alignClassName(alignment) {
    return "align" + alignment.charAt(0).toUpperCase() + alignment.slice(1);
}

// The scene title follows the text below it. A paragraph with its own "# align:"
// tag passes that alignment to the title right above it. Without a tag the CSS
// falls back to the story alignment.
function setAlignment($elements, alignment) {
    $elements.removeClass(ALIGN_CLASSES);
    if( alignment ) $elements.addClass(alignClassName(alignment));
}

function alignmentFromTag(tag) {
    var match = String(tag).trim().replace(/^#\s*/, "").match(/^align\s*:\s*(left|center|right)\s*$/i);
    return match && match[1].toLowerCase();
}

function addTags(tags)
{
    tags = tags || [];
    // # screen begins an independent visual page, but does not stop or redirect
    // the Ink engine. Crucially, the incoming paragraph has not rendered yet.
    const presentation = document.getElementById("player")?.dataset.presentation || "traditional";
    if( ScreenMode.startsScreen(presentation, tags) ) {
        const hadVisibleContent = $textBuffer.children(".storyText, .scene-title, .story-visual, img").length > 0;
        if( hadVisibleContent ) console.warn("Screen Mode: text before # screen in the same turn is not shown. Put action text in its destination screen or end the previous screen with a choice.");
        const followingText = pendingStoryText;
        clearScene();
        pendingStoryText = followingText;
    }
    flushPendingStoryText();

    // Alignment is resolved first: the scene title (and, for the first paragraph,
    // the story title and author) follow the paragraph they sit above.
    const alignmentTag = tags.map(alignmentFromTag).find(align => align !== null && align !== undefined);
    const titleTag = tags.map(sceneTitleFromTag).find(title => title !== null && title !== undefined);
    var $lastStoryParagraph = $textBuffer.children(".storyText").last();

    // A scene starts with a "# title:" tag. Its "# align:" tag, if any,
    // is the scene's alignment; without one the scene goes back to the story alignment.
    // An "# align:" tag on any other paragraph only affects that paragraph.
    const startsScene = titleTag !== null && titleTag !== undefined;
    if( startsScene ) {
        sceneAlignment = alignmentTag || null;
        if( $lastStoryParagraph.length ) setAlignment($lastStoryParagraph, sceneAlignment);
    }
    if( alignmentTag && $lastStoryParagraph.length ) setAlignment($lastStoryParagraph, alignmentTag);

    if( titleTag ) {
        var $sceneTitle = $("<h2 class='scene-title sceneTitle'></h2>").text(InkRichText.plainText(titleTag));
        if( alignmentTag ) setAlignment($sceneTitle, alignmentTag);
        if( $lastStoryParagraph.length ) $lastStoryParagraph.before($sceneTitle);
        else $textBuffer.append($sceneTitle);
        if( animationEnabled && shouldAnimate() ) fadeIn($sceneTitle);
    }

    // The frame background is applied first; the scene picture remains a child above it.
    tags.forEach(addBackgroundTag);
    // image: src follows the paragraph it belongs to, as in the exported page.
    tags.forEach(addImageTag);

    // Control tags, alignment, scene titles and pictures are not visible tags.
    var globalTags = new Set(JSON.parse($("#player").attr("data-global-tags") || "[]"));
    var visibleTags = tags.filter(tag =>
        !globalTags.has(String(tag)) && !isSoundTag(tag)
            && sceneTitleFromTag(tag) === null && alignmentFromTag(tag) === null
            && imageFromTag(tag) === null && backgroundFromTag(tag) === null
            && !ScreenMode.isScreenTag(tag));
    if( visibleTags.length === 0 ) {
        contentReady();
        return;
    }

    var tagsStr = visibleTags.join(", ");
    var $tags = $("<p class='tags'></p>").text("# " + tagsStr);

    $textBuffer.append($tags);

    if( animationEnabled && shouldAnimate() )
        fadeIn($tags);
}

// Choices live in the frame's footer, not in the scrolling passage, so they stay put
// while the narrative scrolls above them.
function choicesFor($frame) {
    $frame = $frame && $frame.length ? $frame : bufferFrame();
    return $(GameChrome.choicesIn($frame[0]));
}

function clearChoices($frame) {
    $frame = $frame && $frame.length ? $frame : bufferFrame();
    var $choices = $frame.children(".story-choices").first();
    if( $choices.length ) {
        $choices.empty().prop("hidden", true);
        $choices[0].scrollTop = 0;
    }
    $frame.removeClass("has-choices");
}

function addChoice(choice, callback)
{
    flushPendingStoryText();
    // New format (since ink can have tags directly on choices)
    // choice: {
    //    choice: {
    //      text: "this is a choice",
    //      tags: ["a tag", "another tag"]
    //    },
    //    ... other stuff, e.g. choice number ...
    // }
    var $choice = $("<button type='button' class='choice-button'></button>");
    // Choices are plain text: formatting markers, if any are left in the file, are dropped
    $choice[0].appendChild(document.createTextNode(InkRichText.plainText(choice.choice.text)));
    var choiceTags = (choice.choice.tags || []);
    // Picture tags on choices belong to the chosen branch, not to its label.
    var visibleChoiceTags = choiceTags.filter(tag => !isSoundTag(tag)
        && imageFromTag(tag) === null && backgroundFromTag(tag) === null);
    var $tags = null;
    if( visibleChoiceTags.length > 0 ) {
        var tagsStr = "# " + visibleChoiceTags.join(" # ");
        $tags = $("<span class='tags'></span>").text(" " + tagsStr);
    }

    // Append the choice to the footer
    var $frame = bufferFrame();
    var $choices = choicesFor($frame);
    var $choicePara = $("<p class='choice'></p>");
    $choicePara.append($choice);
    if( $tags != null ) $choice.append($tags);
    $choices.append($choicePara);
    $choices.prop("hidden", false);
    $frame.addClass("has-choices");

    // Fade it in
    if( animationEnabled && shouldAnimate() )
        fadeIn($choicePara);

    // When this choice is clicked, the chosen branch replaces the passage on screen.
    $choice.on("click", () => {
        clearScene();
        selectedChoiceText = choice.choice.text;
        callback();
    });
}

function addEndingMarker() {
    flushPendingStoryText();
    const player = document.getElementById("player");
    if (!player || !$textBuffer.length) return;
    // Do not produce duplicate markers if compilation completion is replayed.
    $textBuffer.children(".story-ending").remove();
    const element = EndingMarker.create(document, player.dataset.endingText || EndingMarker.DEFAULT_TEXT);
    EndingMarker.update(element, player.dataset.endingShow !== "0", player.dataset.endingText);
    $textBuffer.append(element);
    // Terminal state: provide a reader-level replay action for *every* Ink story.
    // The ending marker belongs to the narrative, while replay belongs to the choices footer.
    var $frame = bufferFrame();
    var $choices = choicesFor($frame);
    $choices.children(".story-replay-choice").remove();
    const replayEnabled = player.dataset.endingPlayAgainShow !== "0";
    const replay = EndingMarker.createReplayChoice(document, player.dataset.endingPlayAgainText);
    replay.hidden = !replayEnabled;
    replay.querySelector("button").addEventListener("click", function() {
        if( events.restartStory ) events.restartStory();
    });
    $choices.append(replay).prop("hidden", !replayEnabled);
    $frame.toggleClass("has-choices", replayEnabled);
}

function addTerminatingMessage(message, cssClass)
{
    flushPendingStoryText();
    var $message = $("<p></p>").addClass(cssClass).text(message);
    $textBuffer.append($message);

    if( animationEnabled && shouldAnimate() )
        fadeIn($message);
}

function addLongMessage(message, cssClass)
{
    flushPendingStoryText();
    var $message = $("<pre></pre>").addClass(cssClass).text(message);
    $textBuffer.append($message);

    if( animationEnabled && shouldAnimate() )
        fadeIn($message);
}

function addLineError(error, callback)
{
    var $aError = $("<a href='#'></a>").text(`${i18n._("Line")} ${error.lineNumber}: ${error.message}`);
    $aError.on("click", callback);

    var $paragraph = $("<p class='error'></p>");
    $paragraph.append($aError);
    $textBuffer.append($paragraph);
}

function addEvaluationResult(result, error)
{   
    var $result;
    if( error ) {
        $result = $('<div class="evaluationResult error"><span></span></div>');
        $result.find("span").text(error);
    } else {
        $result = $('<div class="evaluationResult"><span></span></div>');
        $result.find("span").text(result);
    }
    $textBuffer.append($result);
}

function setInstructionPrefix(prefix) {
    if( instructionPrefix == prefix ) return;

    instructionPrefix = prefix;

    // Refresh any existing content
    let $storyChunks = $textBuffer.find("p.storyText");
    for(let storyChunk of $storyChunks) {
        let $storyChunk = $(storyChunk);
        $storyChunk.removeClass("customInstruction");

        if( storyChunk.textContent.trim().startsWith(instructionPrefix) ) {
            $storyChunk.addClass("customInstruction");
        }
    }
}

function setAnimationEnabled(animEnabled) {
    animationEnabled = animEnabled;
}

exports.PlayerView = {
    startStoryFromTitle: startStory,
    setEvents: (e) => { events = e; },
    contentReady: contentReady,
    isTitleScreenPending: isTitleScreenPending,
    resetTitleScreen: resetTitleScreen,
    prepareForNewPlaythrough: prepareForNewPlaythrough,
    addTextSection: addTextSection,
    addTags: addTags,
    addChoice: addChoice,
    addTerminatingMessage: addTerminatingMessage,
    addEndingMarker: addEndingMarker,
    addLongMessage: addLongMessage,
    clearScene: clearScene,
    addLineError: addLineError,
    addEvaluationResult: addEvaluationResult,
    showSessionView: showSessionView,
    setInstructionPrefix: setInstructionPrefix,
    setImageResolver: resolver => { imageResolver = typeof resolver === "function" ? resolver : () => null; },
    setSelectedChoiceText: text => { selectedChoiceText = text == null ? null : String(text); },
    setAnimationEnabled: setAnimationEnabled
};  