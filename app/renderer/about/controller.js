const electron = require("electron");
const ipc = electron.ipcRenderer;
const $ = window.jQuery = require('../jquery-2.2.3.min.js');


ipc.on("set-about-data", (event, data) => {
    $("#version-inky").text("Inky version: "+data.inkyVersion);
    $("#version-ink").text("ink version: "+data.inkVersion);
    $("#version-inkjs").text("inkjs version: "+data.inkjsVersion);
});

function updateTheme(event, newTheme) {
		if (newTheme && newTheme.toLowerCase() === 'dark') {
        $("body").addClass("dark");
    } else {
        $("body").removeClass("dark");
    }
}

updateTheme(null, window.localStorage.getItem("theme"));
ipc.on("change-theme", updateTheme);
