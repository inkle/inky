# TODO

## SOON

* Correct logic for re-parsing file for includes - see: `// TODO: Don't do this on every change`
    * Simply pause before parsing? But make sure it parses on first load. (how? InkFile forces it when the document has been read?)

* Don't tell includes to refresh unless they've changed - see: `// TODO: Only fire when actually changed`

* inklecate has errors on includes since it only compiles ink from /tmp/someinkfile.ink
    * Copy entire unsaved project into /tmp for compilation?

* Clicking sidebar ink files should display them in the editor

* Open sidebar when loading project with includes

* Recursive include file parsing

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