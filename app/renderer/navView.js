const $ = window.jQuery = require('./jquery-2.2.3.min.js');
const path = require("path");
const _ = require("lodash");

const slideAnimDuration = 200;
var sidebarWidth = 200;

var $sidebar = null;
var $navWrapper = null;
var $twoPane = null;
var $footer = null;
var $newIncludeForm = null;

var visible = false;
var hasBeenShown = false;
var events = {};

$(document).ready(() => {
    $sidebar = $(".sidebar");
    $navWrapper = $sidebar.find(".nav-wrapper");
    $twoPane = $(".twopane");
    $sidebarSplit = $("#main").children(".split");
    $sidebarSplit.hide();
    $sidebarSplit.css("left", 0);
    $footer = $sidebar.find(".footer");

    // Clicking on files
    $navWrapper.on("click", ".nav-group-item", function(event) {
        event.preventDefault();

        var $targetNavGroupItem = $(event.currentTarget);
        highlight$NavGroupItem($targetNavGroupItem);

        var fileIdStr = $targetNavGroupItem.attr("data-file-id");
        var fileId = parseInt(fileIdStr);
        events.clickFileId(fileId);
    });

    // Add new include interactions
    $newIncludeForm = $footer.find(".new-include-form");
    $footer.find(".add-include-button").on("click", function(event) {
        setIncludeFormVisible(true);
        event.preventDefault();
        
    });
    $footer.find("#cancel-add-include").on("click", function(event) {
        setIncludeFormVisible(false);
        event.preventDefault();
    })

    function confirmAddInclude() {
        var $inputBox = $newIncludeForm.find("input[type='text']");
        var $addToMainInkCheckbox = $newIncludeForm.find(".add-to-main-ink input");

        var confirmedFilename = $inputBox.val();
        if( !confirmedFilename || confirmedFilename.trim().length == 0 ) {
            $inputBox.addClass("error");
            setImmediate(() => $inputBox.focus());
        } else {
            
            var shouldAddToMainInk = $addToMainInkCheckbox.get(0).checked;
            var success = events.addInclude(confirmedFilename, shouldAddToMainInk);
            if( success ) setIncludeFormVisible(false);
        }
    }

    $newIncludeForm.find("input").on("keypress", function(event) {
        const returnKey = 13;
        if( event.which == returnKey ) {
            confirmAddInclude();
            event.preventDefault();
        }
    });
    $newIncludeForm.find("#add-include").on("click", function(event) {
        event.preventDefault();
        confirmAddInclude();
    })

    // Unfortuanately you can't capture escape from the input itself
    $(document).keyup(function(e) {
        const escape = 27;
        if (e.keyCode == escape) {
            if( $newIncludeForm.find("input").is(":focus") ) {
                e.preventDefault();
                setIncludeFormVisible(false);
            }
        }
    });

    $(document).on("click", function(e) {
        var $target = $(e.target);
        if( $footer.hasClass("showingForm") && $target.closest(".footer").length == 0 && $target.closest(".split") == 0 ) {
            setIncludeFormVisible(false);
            e.preventDefault();
        }
    });
});

function setMainInkFilename(name) {
    $navWrapper.find(".nav-group.main-ink .nav-group-item .filename").text(name);
}

function setFiles(mainInk, allFiles) {

    var unusedFiles = _.filter(allFiles, f => f.isSpare);
    var normalIncludes = _.filter(allFiles, f => !f.isSpare && f != mainInk);
    var groupedIncludes = _.groupBy(normalIncludes, f => { 
        var dirName = path.dirname(f.relativePath());
        if( dirName == "." )
            dirName = "";
        return dirName;
    });

    var groupsArray = _.map(groupedIncludes, (group, name) => { return {name: name, files: group}; });
    groupsArray.sort((a,b) => a.name.localeCompare(b.name));

    if( unusedFiles.length > 0 )
        groupsArray.push({
            name: "Unused files",
            files: unusedFiles
        });

    $navWrapper.empty();

    var extraClass = mainInk.hasUnsavedChanges || mainInk.brandNewEmpty ? "unsaved" : "";
    var $main = `<nav class="nav-group main-ink">
                    <h5 class="nav-group-title">Main ink file</h5>
                    <a class="nav-group-item ${extraClass}" data-file-id="${mainInk.id}">
                        <span class="icon icon-book"></span>
                        <span class="filename">${mainInk.filename()}</span>
                    </a>
                </nav>`;
    $navWrapper.append($main)

    groupsArray.forEach(group => {
        var items = "";

        group.files.forEach((file) => {
            var name = file.isSpare ? file.relativePath() : file.filename();
            var extraClass = file.hasUnsavedChanges || file.brandNewEmpty ? "unsaved" : "";
            items = items + `<span class="nav-group-item ${extraClass}" data-file-id="${file.id}">
                                <span class="icon icon-doc-text"></span>
                                <span class="filename">${name}</span>
                            </span>`;
        });

        extraClass = "";
        if( group.files === unusedFiles )
            extraClass = "unused";

        var $group = $(`<nav class="nav-group ${extraClass}"><h5 class="nav-group-title">${group.name}</h5> ${items} </nav>`);
        $navWrapper.append($group);
    });
}

function highlight$NavGroupItem($navGroupItem) {
    $navWrapper.find(".nav-group-item").not($navGroupItem).removeClass("active");
    $navGroupItem.addClass("active");
}

function highlightRelativePath(relativePath) {
    var dirName = path.dirname(relativePath);
    if( dirName == "." )
        dirName = "";

    var filename = path.basename(relativePath);

    var $group = $navWrapper.find(".nav-group").filter((i, el) => $(el).find(".nav-group-title").text() == dirName);
    if( dirName == "" ) $group = $group.add(".nav-group.main-ink");

    var $file = $group.find(".nav-group-item .filename").filter((i, el) => $(el).text() == filename);
    var $navGroupItem = $file.closest(".nav-group-item");
    highlight$NavGroupItem($navGroupItem);
}

function hide() {
    if( !visible )
        return;

    sidebarWidth = $sidebarSplit.position().left;

    $sidebar.animate({
        width: 0,
    }, slideAnimDuration, () => {
        $sidebar.hide();
    });
    $twoPane.animate({
        left: 0
    }, slideAnimDuration);
    $sidebarSplit.animate({
        left: 0
    }, slideAnimDuration);
    visible = false;
}

function show() {
    if( visible )
        return;

    hasBeenShown = true;

    // hidden class only exists in initial state
    $sidebar.removeClass("hidden");
    $sidebarSplit.removeClass("hidden");

    $sidebar.show();
    $sidebarSplit.show();

    $sidebar.animate({
        width: sidebarWidth-1 // border
    }, slideAnimDuration);
    $twoPane.animate({
        left: sidebarWidth
    }, slideAnimDuration);
    $sidebarSplit.animate({
        left: sidebarWidth
    }, slideAnimDuration);
    visible = true;
}

function setIncludeFormVisible(visible) {
    var $inputBox = $newIncludeForm.find("input[type='text']");
    if( visible ) {
        $inputBox.val("");
        $inputBox.removeClass("error");
        $footer.addClass("showingForm");
        $inputBox.focus();
    } else {
        $inputBox.blur();
        $inputBox.removeClass("error");
        $footer.removeClass("showingForm");
    }
}

exports.NavView = {
    setMainInkFilename: setMainInkFilename,
    setFiles: setFiles,
    highlightRelativePath: highlightRelativePath,
    setEvents: e => events = e,
    hide: hide,
    show: show,
    initialShow: () => { if( !hasBeenShown ) show(); },
    toggle: () => { if( visible ) hide(); else show(); },
    showAddIncludeForm: () => setIncludeFormVisible(true)
}