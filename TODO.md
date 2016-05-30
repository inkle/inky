# TODO

## SOON


## Features and improvements

* Multi-ink file editing
    * Creation / saving of includes
        * Contextual menu on includes (Rename, Delete)
        * Mac-style pressing return with a file selected to rename it? Double click to rename?
        * File -> Rename current file
        * Drag/drop between groups (more tricky!)
    * Highlight files in nav that have errors
    * Add filenames to issue browser (as headings, only when in multi-file and not in single active file)
    * Automatic discovery of other nearby ink files in addition to those that are INCLUDE-ed
        * Apparently `fs.watch` is crap, and you should use <https://github.com/paulmillr/chokidar>, which has been used in big popular projects successfully
        * `var watcher = fs.watch(filename[, options][, listener])`
            * `filename` can be a dir
            * `options` can include `recursive`
            * call `watcher.close()` to stop
        * If watching, we can live-reload files without unsaved changes, and refresh the nav


* Toolbar UI to jump to a particular path at the start of the story when playing
* Other debugging features: ability to query variables, list variables etc
* Include step back buttons on each turn chunk to rewind to a specific one

* Ability to hide/show editor and player views
    * Add large-ish left/right margins to both when very wide to give a sort of "focus" mode, esp when fullscreen

* Pause live compilation / playing?

* Switch to specific ink file within the current project when opening an ink file externally that's related to the current project

* Error checking for file system integration (opening / saving files etc currently doesn't check for any errors)

* Dynamically change menu item titles to reflect current file. e.g. Save current file => Save jolly.ink

* Get menu item enabling behaviour right - e.g. save is only available if it's currently needed

* Ability export a JSON file

* Ability to export a full web player, using ink.js

* Ability to load & play a JSON file, with all editing controls hidden?

## Engineering

* **FIX:**
    * Quit never completes if it has to go through a project save dialog (even when not saving)
    * `/tmp` never gets cleared out, so if you remove a file in the project (e.g. in the finder), it still compiles when it shouldn't.
    * Replaying a story goes through a transition for the last turn
        * jquery still fades in the last chunk even though it's a replay
        * should force the view height never to get smaller despite temporary content reduction
    * Cmd-D for "don't save" option
    * (VERIFY) Multiple windows - can be flaky? e.g. saving v.s. compiling etc
    * (DONE?) Reliability of story reloading - sometimes it fails
    * (DONE?) Copies of inklecate left open sometimes

* inklecate.js should compile within a project/window specific sub-folder to avoid collisions
    * Investigate fs.mkdtemp(prefix, callback)

* Convert ad-hoc style events to be proper NodeJS EventEmitters (?)
