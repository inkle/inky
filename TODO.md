# TODO

## SOON

* Back and forward buttons
    * Navigation history - should probably be outside of `EditorView` since it needs to cope with different files
        * Can use a combination of our own callbacks for moving between files and ace's own callbacks for cursor position. How to only record big-ish jumps...?

## Features and improvements

* Multi-ink file editing
    * Add filenames to issue browser (as headings, only when in multi-file and not in single active file)
    * Highlight files in nav that have errors
    * Creation / saving of includes
        * File -> Add Include...
        * (+) button at bottom of sidebar (and inside each group?)
        * Simply typing into new include file created by writing an INCLUDE line
            * Maybe show them as greyed out or something to show they haven't been fully created yet?
        * Contextual menu on includes (Rename, Delete)
        * File -> Rename current file
        * Drag/drop between groups (more tricky!)
    * Recursive include file parsing (currently it only works one include level deep)
    * Automatic discovery of other nearby ink files in addition to those that are INCLUDE-ed
        * Apparently `fs.watch` is crap, and you should use <https://github.com/paulmillr/chokidar>, which has been used in big popular projects successfully
        * `var watcher = fs.watch(filename[, options][, listener])`
            * `filename` can be a dir
            * `options` can include `recursive`
            * call `watcher.close()` to stop
        * If watching, we can live-reload files without unsaved changes, and refresh the nav
* Include step back buttons on each turn chunk to rewind to a specific one
* Drag split view divider
    * And hide/show editor and player views?
* Pause live compilation / playing?
* Switch to specific ink file within the current project when opening an ink file externally that's related to the current project
* Error checking for file system integration (opening / saving files etc currently doesn't check for any errors)
* Dynamically change menu item titles to reflect current file. e.g. Save current file => Save jolly.ink
* Get menu item enabling behaviour right - e.g. save is only available if it's currently needed

## Engineering

* **FIX:**
    
    * Advanced divert usage doesn't highlight properly and therefore symbol search breaks. e.g.:

        `-> somewhere( -> divertTarget ) -> somewhereElse( -> anotherTarget, -> yetAnother )`

    * Quit never completes if it has to go through a project save dialog (even when not saving)
    * (DONE?) When inklecate crashes, we should handle it specially
    * Replaying a story goes through a transition for the last turn
        * jquery still fades in the last chunk even though it's a replay
        * should force the view height never to get smaller despite temporary content reduction
    * Cmd-D for "don't save" option
    * Only write out ink files that have changed for compilation
    * (VERIFY) Multiple windows - can be flaky? e.g. saving v.s. compiling etc
    * (DONE?) Reliability of story reloading - sometimes it fails
    * (DONE?) Copies of inklecate left open sometimes

* inklecate.js should compile within a project/window specific sub-folder to avoid collisions
    * Investigate fs.mkdtemp(prefix, callback)

* Convert ad-hoc style events to be proper NodeJS EventEmitters (?)
