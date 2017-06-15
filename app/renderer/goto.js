const electron = require("electron");
const ipc = electron.ipcRenderer;
const _ = require("lodash");
const {filter, wrap} = require("fuzzaldrin-plus");

const $ = window.jQuery = require('./jquery-2.2.3.min.js');

const InkProject = require("./inkProject.js").InkProject;

var $goto = null;
var $gotoContainer = null;
var $input = null;
var $results = null;

var $selectedResult = null;

var lastMousePos = null;

var events = {
    gotoFile: () => {}
};

function show() {
    $goto.removeClass("hidden");
    $gotoContainer.removeClass("ignore-events");
    $input.val("");

    select(null);

    setTimeout(() => $input.focus(), 200);

    $(document).on("keydown", gotoGlobalKeyHandler);
}

function hide() {
    $(document).off("keydown", gotoGlobalKeyHandler);

    $goto.addClass("hidden");
    $gotoContainer.addClass("ignore-events");
}

function toggle() {
    if( $goto.hasClass("hidden") )
        show();
    else
        hide();
}



function refresh() {

    var searchStr = $input.val();

    $results.empty();

    select(null);

    if( !searchStr ) return;

    var toQuery = _.map(InkProject.currentProject.files, file => ({
        name: file.filename(),
        file: file
    }));

    var results = filter(toQuery, searchStr, {key: "name"});

    _.each(results, result => {
        var wrappedResult = wrap(result.name, searchStr, { wrap: {
            tagOpen: "<span class='goto-highlight'>",
            tagClose: "</span>"
        }});
        var $result = $(`<li>${wrappedResult}</li>`);
        $result.data("result", result);
        $result.on("click", result, () => choose($result));
        $result.on("mousemove", (e) => {
            // Only mouse-over something if it's really the mouse that moved rather than
            // just the document scrolling under the mouse.
            if( lastMousePos == null || lastMousePos.pageX != e.pageX || lastMousePos.pageY != e.pageY ) {
                lastMousePos = { pageX: e.pageX, pageY: e.pageY };
                select($(e.target))
            }
        });
        $results.append($result);
    });
}

function select($result)
{
    if( $selectedResult != null )
        $selectedResult.removeClass("selected");

    $selectedResult = $result;

    if( $selectedResult != null )
        $selectedResult.addClass("selected");
}

function choose($result)
{
    var result = $result.data().result;
    if( result.file )
        events.gotoFile(result.file);

    // done!
    hide();
}

function nextResult() {

    // Select very first (after input being active)
    if( $selectedResult == null ) {
        var $first = $results.children("li").first();
        if( $first.length > 0 )
            select($first);
        $input.blur();
        return;
    }

    var $next = $selectedResult.next();
    if( $next.length > 0 )
        select($next);
}

function previousResult() {
    if( $selectedResult == null ) return;
    var $prev = $selectedResult.prev();
    if( $prev.length > 0 )
        select($prev);
}

function scrollToRevealResult() {
    if( $selectedResult != null ) {
        var $container = $selectedResult.parent();
        var top = $container.offset().top;
        var bottom = top + $container.height();
        var mid = 0.5 * (top + bottom);

        var currPos = $selectedResult.offset().top;
        if( currPos < top || currPos+$selectedResult.height() > bottom ) {
            $selectedResult[0].scrollIntoView(currPos < mid);
        }
    }
}

function gotoGlobalKeyHandler(e) {

    // down
    if( e.keyCode == 40 ) {
        nextResult();
        scrollToRevealResult();
        e.preventDefault();
    } 

    // up
    else if( e.keyCode == 38 ) {
        previousResult();
        scrollToRevealResult();
        e.preventDefault();
    }

    // return
    else if( e.keyCode == 13 ) {
        if( $selectedResult != null )
            choose($selectedResult);
    }

    // escape
    else if( e.keyCode == 27 ) {
        hide();
    }
}

$(document).ready(() => {
    $goto = $("#goto-anything");
    $gotoContainer = $("#goto-anything-container");
    $input = $goto.children("input");
    $results = $goto.children(".results");
    $input.on("input", refresh);
    $input.on("focus", () => select(null));

    $gotoContainer.on("click", () => hide());

    // Some other events are handled global document handler
    $input.on("keydown", (e) => {
        if( e.keyCode == 13 ) {
            nextResult();
            e.preventDefault();
        }
    });
});

ipc.on("goto-anything", (event) => {
    toggle();
});

exports.GotoAnything = {
    setEvents: e => events = e,
}