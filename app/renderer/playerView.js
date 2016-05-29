const $ = window.jQuery = require('./jquery-2.2.3.min.js');

var shouldClearPlayerContent = false;
var lastFadeTime = 0;

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

function addTextSection(text, animated)
{
    clearIfNecessary();

    var $paragraph = $("<p class='storyText'></p>");
    $paragraph.text(text);
    $("#player .innerText").append($paragraph);

    if( animated )
        fadeIn($paragraph);
}

function addChoice(choice, animated, callback)
{
    clearIfNecessary();

    var $choice = $("<a href='#'>"+choice.text+"</a>");

    // Append the choice
    var $choicePara = $("<p class='choice'></p>");
    $choicePara.append($choice);
    $("#player .innerText").append($choicePara);

    // Fade it in
    if( animated )
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
    fadeIn($message);
    $("#player .innerText").append($message);
}

function addLongMessage(message, cssClass)
{
    clearIfNecessary();

    var $message = $(`<pre class='${cssClass}'>${message}</pre>`);
    fadeIn($message);
    $("#player .innerText").append($message);
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
    scrollToBottom: scrollToBottom,
    prepareForNextContent: prepareForNextContent,
    addTextSection: addTextSection,
    addChoice: addChoice,
    addTerminatingMessage: addTerminatingMessage,
    addLongMessage: addLongMessage,
    addHorizontalDivider: addHorizontalDivider,
    addLineError: addLineError
};