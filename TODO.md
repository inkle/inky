# TODO

## SOON

* Move currentProject (and other project stuff) from controller.js to InkProject.js

* Add Mac dot on red traffic light for unsaved changes

* Ability to drag and drop files onto dock icon

* Error checking for file system integration

## Features and improvements

* Drag split view divider
    * And hide/show editor and player views?
* Pause live compilation / playing?
* Ability to make the app the default one for ink
* Multi-ink file editing
    * Parse INCLUDE lines, allow you to jump between them via nav
        * What should happen in the document model?
    * Enable opt-click INCLUDE declarations
    * Automatic discovery of other nearby ink files in addition to those that are INCLUDE-ed


## Engineering

* **FIX:**
    * Reliability of story reloading - sometimes it fails
    * When inklecate crashes, we should handle it specially
    * (DONE?) Replaying a story sometimes goes through a few transitions (e.g. with The Intercept)
    * Copies of inklecate left open sometimes (bleh, still happening)
        * Check when windows are closed
    * Focus editor view on load
    * Multiple windows - robustness (do we still have a problem here?)

* Background worker for document model
    * Build simple hierarchy of document
        * Knots, stitches, gathers/choices
        * Include file structure

          This should be in one overall hierarchy so it's possible to jump between INCLUDE files by searching for symbols
    
      Can we scan multiple files with ace without actually putting them in the DOM?