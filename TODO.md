# TODO

## SOON

* Ability export a JSON file (to slot into other pipelines e.g. ink.js, though general Unity pipeline is fine)

## Need before release

* Undo not working in editor??

* inklecate.js should compile within a project/window specific sub-folder to avoid collisions across projects
    * Investigate fs.mkdtemp(prefix, callback)

* Bit of solid testing
    * Particularly save/load functionality

## Features and improvements

* Some more shortcuts:
    * Ctrl-(shift)-tab to switch back/forth between files (what order? order of usage or order within sidebar?)

* Removal and renaming of includes (and renaming of main ink?)
    * Contextual menu on includes (Rename, Delete)
    * Mac-style pressing return with a file selected to rename it? Double click to rename?
    * File -> Rename current file

* Proper hierarchy view for includes rather than currently single-level groupings?
* Drag/drop includes between groups? (tricky!)
* Highlight files in nav that have errors
* Add filenames to issue browser (as headings, only when in multi-file and not in single active file)
* Switch to specific ink file within the current project when opening an ink file externally that's related to the current project

* File system watch: Automatic discovery of other nearby ink files in addition to those that are INCLUDE-ed, and detect removal and renaming of existing files
    * Apparently `fs.watch` is crap, and you should use <https://github.com/paulmillr/chokidar>, which has been used in big popular projects successfully
    * `var watcher = fs.watch(filename[, options][, listener])`
        * `filename` can be a dir
        * `options` can include `recursive`
        * call `watcher.close()` to stop
    * If watching, we can live-reload files without unsaved changes, and refresh the nav

* Error checking for file system integration (opening / saving files etc currently doesn't check for any errors)

* Toolbar UI to jump to a particular path at the start of the story when playing
* Other debugging features: ability to query variables, list variables etc
* Include step back buttons on each turn chunk to rewind to a specific one

* Ability to hide/show editor and player views
    * Add large-ish left/right margins to both when very wide to give a sort of "focus" mode, esp when fullscreen

* Pause live compilation / playing?

* Dynamically change menu item titles to reflect current file. e.g. Save current file => Save jolly.ink

* Get menu item enabling behaviour right - e.g. save is only available if it's currently needed

* Ability to export a full web player, using ink.js

* Ability to load & play a JSON file, with all editing controls hidden?

## Engineering

* **FIX:**
    * Ace editor highlights don't get removed when switching between files (sometimes?)
        * Perhaps when you fix an error then return to the file where the error was? (e.g. "-> elsewhere", new file, define elsewhere, fixes error in original file)
    * `/tmp` never gets cleared out, so if you remove a file in the project (e.g. in the finder), it still compiles when it shouldn't.
    * Replaying a story goes through a transition for the last turn
        * jquery still fades in the last chunk even though it's a replay
        * should force the view height never to get smaller despite temporary content reduction
    * Cmd-D for "don't save" option
    * (VERIFY) Multiple windows - can be flaky? e.g. saving v.s. compiling etc
    * (DONE?) Reliability of story reloading - sometimes it fails
    * (DONE?) Copies of inklecate left open sometimes

* Change InkFile.path to always be the relative path, remove InkFile.relativePath(), and use InkFile.absolutePath() as the special case, since we always know the relative path, even before saving, and it would simplify the code paths and make things more robust.

* Convert ad-hoc style events to be proper NodeJS EventEmitters (?)
