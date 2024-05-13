const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const i18n = require('./i18n.js');

var events = {};
var lastFadeTime = 0;
var $textBuffer = null;
var instructionPrefix = null;
var animationEnabled = true;

document.addEventListener("keyup", function(){
    $("#player").removeClass("altKey");
});
document.addEventListener("keydown", function(){
    $("#player").addClass("altKey");
});

// Initial default: append to visible buffer
$textBuffer = $("#player .innerText.active");

function shouldAnimate() {
    return $textBuffer.hasClass("active");
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
        $textBuffer = $hidden;
    }
}

function fadeIn($jqueryElement) {

    const minimumTimeSeparation = 200;
    const animDuration = 1000;

    var currentTime = Date.now();
    var timeSinceLastFade = currentTime - lastFadeTime;

    var delay = 0;
    if( timeSinceLastFade < minimumTimeSeparation )
        delay = minimumTimeSeparation - timeSinceLastFade;

    $jqueryElement.css("opacity", 0);
    $jqueryElement.delay(delay).animate({opacity: 1.0}, animDuration);

    lastFadeTime = currentTime + delay;
}

function contentReady() {

    var $scrollContainer = $("#player .scrollContainer");
    $scrollContainer.stop();

    // Need to save these ones because we are resetting height, so these are lost
    var savedScrollTop = $scrollContainer.scrollTop();
    var prevHeight = $textBuffer.height();

    // Need to reset first, otherwise ($textBuffer[0].scrollHeight) is always not less than $textBuffer.height() and it only expands (bad when story has huge list of choices)
    $textBuffer.height(0);
    var newHeight = $textBuffer[0].scrollHeight;

    // Expand to fit or keep same (we will shrink it later, after animating scroll, this way scroll animation is prettier)
    if( prevHeight < newHeight ) {
        $textBuffer.height(newHeight);
    } else {
        $textBuffer.height(prevHeight);
    }

    // Scroll?
    if( shouldAnimate() ) {
        
        var offset = newHeight + 60 - $scrollContainer.outerHeight(); // +60 because: ("#player .innerText { padding: 10px 0 50px 0; }")

        // Need to set previous, as it was reset when we reset height
        $scrollContainer.animate({scrollTop: savedScrollTop}, 0);

        $scrollContainer.animate({
            scrollTop: (offset)
        }, animationEnabled ? 500 : 100, function(){
            // Shrink, if needed
            if( prevHeight > newHeight ) {
                $textBuffer.height(newHeight);
            }
        });

    }
}

function prepareForNewPlaythrough(sessionId) {

    $textBuffer = $("#player .hiddenBuffer .innerText");
    $textBuffer.data("sessionId", sessionId);

    $textBuffer.text("");
    $textBuffer.height(0);
}

function addTextSection(text)
{
    var $paragraph = $("<p class='storyText'></p>");

    // Game-specific instruction prefix, e.g. >>> START CAMERA: Wide shot
    if( instructionPrefix && text.trim().startsWith(instructionPrefix) ) {
        $paragraph.addClass("customInstruction");
    }

    // Split individual words into span tags, so that they can be underlined
    // when the user holds down the alt key, and so that they can be individually
    // clicked in order to jump to the source.
    var splitIntoSpans = text.split(" ");
    var textAsSpans = "<span>" + splitIntoSpans.join("</span> <span>") + "</span>";

    $paragraph.html(textAsSpans);

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
    var offset = previousContentLength;
    $paragraph.children("span").each((i, element) => {
        var $span = $(element);
        var length = $span.text().length;
        $span.data("range", {start: offset, length: length});
        offset += length + 1; // extra 1 for space
    });

    // Alt-click handler to jump to source
    $paragraph.find("span").click(function(e) {
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

function addTags(tags)
{
    var tagsStr = tags.join(", ");
    var $tags = $(`<p class='tags'># ${tagsStr}</p>`);

    $textBuffer.append($tags);

    if( animationEnabled && shouldAnimate() )
        fadeIn($tags);
}

function addChoice(choice, callback)
{
    // New format (since ink can have tags directly on choices)
    // choice: {
    //    choice: {
    //      text: "this is a choice",
    //      tags: ["a tag", "another tag"]
    //    },
    //    ... other stuff, e.g. choice number ...
    // }
    var $choice = $("<a href='#'>"+choice.choice.text+"</a>");
    var $tags = null;
    if( choice.choice.tags != null && choice.choice.tags.length > 0 ) {
        var tagsStr = "# " + choice.choice.tags.join(" # ");
        $tags = $(` <span class='tags'>${tagsStr}</span>`);
    }

    // Append the choice
    var $choicePara = $("<p class='choice'></p>");
    $choicePara.append($choice);
    if( $tags != null ) $choicePara.append($tags);
    $textBuffer.append($choicePara);

    // Fade it in
    if( animationEnabled && shouldAnimate() )
        fadeIn($choicePara);

    // When this choice is clicked...
    $choice.on("click", (event) => {

        var existingHeight = $textBuffer.height();
        $textBuffer.height(existingHeight);

        // Remove any existing choices, and add a divider
        $(".choice").remove();

        addHorizontalDivider();

        event.preventDefault();

        callback();
    });
}

function addTerminatingMessage(message, cssClass)
{
    var $message = $(`<p class='${cssClass}'>${message}</p>`);
    $textBuffer.append($message);

    if( animationEnabled && shouldAnimate() )
        fadeIn($message);
}

function addLongMessage(message, cssClass)
{
    var $message = $(`<pre class='${cssClass}'>${message}</pre>`);
    $textBuffer.append($message);

    if( animationEnabled && shouldAnimate() )
        fadeIn($message);
}

function addHorizontalDivider()
{
    if (($textBuffer[0].lastChild == null) || ($textBuffer[0].lastChild.tagName != "HR")) {
        $textBuffer.append("<hr/>");
    }
}

function addLineError(error, callback)
{
    var $aError = $(`<a href='#'>${i18n._("Line")} ${error.lineNumber}: ${error.message}</a>`);
    $aError.on("click", callback);

    var $paragraph = $("<p class='error'></p>");
    $paragraph.append($aError);
    $textBuffer.append($paragraph);
}

function addEvaluationResult(result, error)
{   
    var $result;
    if( error ) {
        $result = $(`<div class="evaluationResult error"><span>${error}</span></div>`);
    } else {
        $result = $(`<div class="evaluationResult"><span>${result}</span></div>`);
    }
    $textBuffer.append($result);
}

function previewStepBack()
{
    var $lastDivider = $("#player .innerText.active").find("hr").last();
    $lastDivider.nextAll().remove();
    $lastDivider.remove();
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
    setEvents: (e) => { events = e; },
    contentReady: contentReady,
    prepareForNewPlaythrough: prepareForNewPlaythrough,
    addTextSection: addTextSection,
    addTags: addTags,
    addChoice: addChoice,
    addTerminatingMessage: addTerminatingMessage,
    addLongMessage: addLongMessage,
    addHorizontalDivider: addHorizontalDivider,
    addLineError: addLineError,
    addEvaluationResult: addEvaluationResult,
    showSessionView: showSessionView,
    previewStepBack: previewStepBack,
    setInstructionPrefix: setInstructionPrefix,
    setAnimationEnabled: setAnimationEnabled
};  