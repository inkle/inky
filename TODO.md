# TODO

## SOON

* Start parsing file structure for the sake of INCLUDE directives, and also for knot/stitch/gather/choice names

## Features and improvements

* Back and forward buttons
* Drag split view divider
    * And hide/show editor and player views?
* Pause live compilation / playing?
* Multi-ink file editing
    * Parse INCLUDE lines, allow you to jump between them via nav
        * What should happen in the document model?
    * Enable opt-click INCLUDE declarations
    * Automatic discovery of other nearby ink files in addition to those that are INCLUDE-ed
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
    * Build simple hierarchy of document
        * Knots, stitches, gathers/choices
        * Include file structure

          This should be in one overall hierarchy so it's possible to jump between INCLUDE files by searching for symbols
    
      Can we scan multiple files with ace without actually putting them in the DOM?
