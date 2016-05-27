var forceQuitCallback;

// https://www.exratione.com/2013/05/die-child-process-die/

// SIGTERM AND SIGINT will trigger the exit event.
process.once("SIGTERM", function () {
    process.exit(0);
});
process.once("SIGINT", function () {
    process.exit(0);
});
// And the exit event shuts down the child.
process.once("exit", function () {
    forceQuitCallback();
});
 
// This is a somewhat ugly approach, but it has the advantage of working
// in conjunction with most of what third parties might choose to do with
// uncaughtException listeners, while preserving whatever the exception is.
process.once("uncaughtException", function (error) {
    // If this was the last of the listeners, then shut down the child and rethrow.
    // Our assumption here is that any other code listening for an uncaught
    // exception is going to do the sensible thing and call process.exit().
    if (process.listeners("uncaughtException").length === 0) {
        if( forceQuitCallback )
            forceQuitCallback();
        throw error;
    }
});

exports.onForceQuit = (callback) => {
    forceQuitCallback = callback;
}