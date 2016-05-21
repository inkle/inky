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

exports.PlayerView = {
    fadeIn: fadeIn,
    scrollToBottom: scrollToBottom,
    clearIfNecessary: clearIfNecessary,
    prepareForNextContent: prepareForNextContent
};