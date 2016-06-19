# TODO

## Features and improvements

* Some more shortcuts:
    * Ctrl-(shift)-tab to switch back/forth between files (what order? order of usage or order within sidebar?)
    * Back/forward shortcuts (mirroring back/forward buttons) cmd-opt-left/right?
    * Follow symbol under cursor - cmd-opt-return? 

* Find in project
    * Implement <https://ace.c9.io/#nav=api&api=search> across multiple files
    * Replace UI for single files while you're at it?
        * editor.commands.removeCommand('find');

* Go to symbol in project

* Removal and renaming of includes (and renaming of main ink?)
    * Contextual menu on includes (Rename, Delete)
        * Automatically find/replace matching include line
    * Mac-style pressing return with a file selected to rename it? Double click to rename?
    * File -> Rename current file
* Improve behaviour for renaming files in finder
    * Currently file watcher removes then adds, and this causes both the newly renamed file and the old one to appear. The old one appears because it's still being included from somewhere, similar to when you type a new INCLUDE line. Perhaps add a little subtitle to the filename to say "Included from xyz.ink"?

* Proper hierarchy view for includes rather than currently single-level groupings?
* Drag/drop includes between groups? (tricky!)
* Highlight files in nav that have errors
* Add filenames to issue browser (as headings, only when in multi-file and not in single active file)
* Switch to specific ink file within the current project when opening an ink file externally that's related to the current project

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
