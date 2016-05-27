const $ = window.jQuery = require('./jquery-2.2.3.min.js');

const slideAnimDuration = 200;
const defaultWidth = 200;

var $sidebar = null;
var $twoPane = null;

var visible = false;

$(document).ready(() => {
    $sidebar = $(".sidebar");
    $twoPane = $(".twopane");
});

function setCurrentFilename(name) {
    $(".sidebar .nav-group.main-ink .nav-group-item .filename").text(name);
}

function hide() {
    if( !visible )
        return;

    $sidebar.animate({
        width: 0,
    }, slideAnimDuration, () => {
        $sidebar.hide();
    });
    $twoPane.animate({
        left: 0
    }, slideAnimDuration);
    visible = false;
}

function show() {
    if( visible )
        return;

    // hidden class only exists in initial state
    $sidebar.removeClass("hidden");

    $sidebar.show();
    $sidebar.animate({
        width: defaultWidth-1 // border
    }, slideAnimDuration);
    $twoPane.animate({
        left: defaultWidth
    }, slideAnimDuration);
    visible = true;
}

exports.NavView = {
    setCurrentFilename: setCurrentFilename,
    hide: hide,
    show: show,
    toggle: () => { if( visible ) hide(); else show(); }
}