# TODO

## SOON

* Open ink files when choosing symbols
* Open ink files when clicking include lines

* Recursive include file parsing (currently it only works one include level deep)

* Only write out ink files that have changed for compilation

* inklecate.js should compile within a project/window specific sub-folder to avoid collisions
    * Investigate fs.mkdtemp(prefix, callback)

* Multi-ink file editing
    * Parse INCLUDE lines on load, allow you to jump between them via nav
    * Enable opt-click INCLUDE declarations
    * Automatic discovery of other nearby ink files in addition to those that are INCLUDE-ed

## Features and improvements

* Back and forward buttons
* Drag split view divider
    * And hide/show editor and player views?
* Pause live compilation / playing?
* Switch to specific project/file when opening an ink file externally that's related to a particular existing open project
* Error checking for file system integration

## Engineering

* **FIX:**
    * Reliability of story reloading - sometimes it fails
    * When inklecate crashes, we should handle it specially
    * (DONE?) Replaying a story sometimes goes through a few transitions (e.g. with The Intercept)
    * Copies of inklecate left open sometimes (POSSIBLY FIXED AGAIN?)
    * Multiple windows - robustness (do we still have a problem here?)
    * Cmd-D for "don't save" option

* Convert ad-hoc style events to be proper NodeJS EventEmitters

* Background worker for document model
    * Continually re-parse the current document?