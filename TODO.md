# TODO

## Features and improvements

* Document model reliability
    * Sometimes it asks if you want to save, sometimes it doesn't?
    * Ability to drag and drop files on
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

* Background worker for document model
    * Build simple hierarchy of document
        * Knots, stitches, gathers/choices
        * Include file structure

          This should be in one overall hierarchy so it's possible to jump between INCLUDE files by searching for symbols
    
      Can we scan multiple files with ace without actually putting them in the DOM?