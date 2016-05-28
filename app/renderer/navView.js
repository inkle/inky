const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const path = require("path");
const _ = require("lodash");

const slideAnimDuration = 200;
const defaultWidth = 200;

var $sidebar = null;
var $twoPane = null;

var visible = false;
var events = {};

$(document).ready(() => {
    $sidebar = $(".sidebar");
    $twoPane = $(".twopane");
    $sidebar.on("click", ".nav-group-item", function(event) {
        event.preventDefault();

        var $target = $(event.currentTarget);
        $sidebar.find(".nav-group-item").not($target).removeClass("active");
        $target.addClass("active");

        var inkFilename = $target.find(".filename").text();
        var $navGroup = $target.closest(".nav-group");
        if( $navGroup.hasClass("main-ink") ) {
            events.clickFile(inkFilename);
        } else {
            var relativeDir = $target.closest(".nav-group").find(".nav-group-title").text();
            var relativePath = path.join(relativeDir, inkFilename);
            events.clickFile(relativePath);
        }
    });
});

function setCurrentFilename(name) {
    $(".sidebar .nav-group.main-ink .nav-group-item .filename").text(name);
}

function setFilePaths(mainInkPath, includePaths) {
    var mainFilename = path.basename(mainInkPath);
    var baseDirectory = path.dirname(mainInkPath);

    var relativeIncludePaths = _.map(includePaths, (p) => path.relative(baseDirectory, p));
    var includePathsByDir = _.groupBy(relativeIncludePaths, (p) => path.dirname(p));

    var $sidebar = $(".sidebar");
    $sidebar.empty();

    var $main = `<nav class="nav-group main-ink">
                    <h5 class="nav-group-title">Main ink file</h5>
                    <a class="nav-group-item active">
                        <span class="icon icon-book"></span>
                        <span class="filename">${mainFilename}</span>
                    </a>
                </nav>`;
    $sidebar.append($main)

    for(var dir in includePathsByDir) {
        var items = "";
        var includePathsForDir = includePathsByDir[dir];
        includePathsForDir.forEach((incPath) => {
            var incFilename = path.basename(incPath);
            items = items + `<span class="nav-group-item">
                                <span class="icon icon-doc-text"></span>
                                <span class="filename">${incFilename}</span>
                            </span>`;
        });

        var dirTitle = dir;

        // include in same directory as main? just hide the name
        if( dirTitle == "." )
            dirTitle = "";

        var $group = $(`<nav class="nav-group"><h5 class="nav-group-title">${dirTitle}</h5> ${items} </nav>`);
        $sidebar.append($group);
    }
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
    setFilePaths: setFilePaths,
    setEvents: e => events = e,
    hide: hide,
    show: show,
    toggle: () => { if( visible ) hide(); else show(); }
}