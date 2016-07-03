const $ = window.jQuery = require('./jquery-2.2.3.min.js');

var shouldClearPlayerContent = false;
var lastFadeTime = 0;
var animationEnabled = true;

var events = {};

document.addEventListener("keyup", function(){
    $("#player").removeClass("altKey");
});
document.addEventListener("keydown", function(){
    $("#player").addClass("altKey");
});

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

function scrollToBottom() {

    var $lastObj = $(".innerText").children().last();
    var bottomEdge = $lastObj.position().top + $lastObj.height();
    var newHeight = bottomEdge + 100;
    if( $(".innerText").height() < newHeight )
        $(".innerText").height(bottomEdge + 100);

    var offset = newHeight - $("#main").height();
    if( offset > 0 && offset > $("#player").scrollTop() ) {
        $("#player").animate({
            scrollTop: offset
        }, 500);
    }
}

function clearIfNecessary() {
    if( shouldClearPlayerContent ) {

        $("#player .innerText").text("");

        // Temporarily set the height to zero so that it re-collapses,
        // and then we can expand it as the content fills it later
        $(".innerText").height(0);

        shouldClearPlayerContent = false;
    }
}

function prepareForNextContent() {
    shouldClearPlayerContent = true;
}

function addTextSection(text)
{
    clearIfNecessary();

    var $paragraph = $("<p class='storyText'></p>");

    // Split individual words into span tags, so that they can be underlined
    // when the user holds down the alt key, and so that they can be individually
    // clicked in order to jump to the source.
    var splitIntoSpans = text.split(" ");
    var textAsSpans = "<span>" + splitIntoSpans.join("</span> <span>") + "</span>";

    $paragraph.html(textAsSpans);
    var $content = $("#player .innerText");

    // Keep track of the offset of each word into the content,
    // starting from the end of the last choice (it's global in the current play session)
    var previousContentLength = 0;
    var $existingLastContent = $content.children(".storyText").last();
    if( $existingLastContent ) {
        var range = $existingLastContent.data("range");
        if( range ) {
            previousContentLength = range.start + range.length + 1; // + 1 for newline
        }
    }
    $paragraph.data("range", {start: previousContentLength, length: text.length});

    // Append the actual content
    $content.append($paragraph);

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

    if( animationEnabled )
        fadeIn($paragraph);
}

function addChoice(choice, callback)
{
    clearIfNecessary();

    var $choice = $("<a href='#'>"+choice.text+"</a>");

    // Append the choice
    var $choicePara = $("<p class='choice'></p>");
    $choicePara.append($choice);
    $("#player .innerText").append($choicePara);

    // Fade it in
    if( animationEnabled )
        fadeIn($choicePara);

    // When this choice is clicked...
    $choice.on("click", (event) => {

        var existingHeight = $(".innerText").height();
        $(".innerText").height(existingHeight);

        // Remove any existing choices, and add a divider
        $(".choice").remove();
        $("#player .innerText").append("<hr/>");

        event.preventDefault();

        callback();
    });
}

function addTerminatingMessage(message, cssClass)
{
    clearIfNecessary();

    var $message = $(`<p class='${cssClass}'>${message}</p>`);
    $("#player .innerText").append($message);

    if( animationEnabled )
        fadeIn($message);
}

function addLongMessage(message, cssClass)
{
    clearIfNecessary();

    var $message = $(`<pre class='${cssClass}'>${message}</pre>`);
    $("#player .innerText").append($message);

    if( animationEnabled )
        fadeIn($message);
}

function addHorizontalDivider()
{
    $("#player .innerText").append("<hr/>");
}

function addLineError(error, callback)
{
    var $aError = $("<a href='#'>Line "+error.lineNumber+": "+error.message+"</a>");
    $aError.on("click", callback);

    var $paragraph = $("<p class='error'></p>");
    $paragraph.append($aError);
    $("#player .innerText").append($paragraph);
}

exports.PlayerView = {
    setEvents: (e) => { events = e; },
    scrollToBottom: scrollToBottom,
    prepareForNextContent: prepareForNextContent,
    addTextSection: addTextSection,
    addChoice: addChoice,
    addTerminatingMessage: addTerminatingMessage,
    addLongMessage: addLongMessage,
    addHorizontalDivider: addHorizontalDivider,
    addLineError: addLineError,
    animate: (enable) => animationEnabled = enable
};  