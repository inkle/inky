const electron = require("electron");
const ipc = electron.ipcRenderer;

function updateTheme(event, newTheme) {
	if (newTheme && newTheme.toLowerCase() === 'dark') {
		document.body.classList.add("dark");
		document.getElementById("contentView").contentDocument.documentElement.classList.add("dark");
	} else {
		document.body.classList.remove("dark");
		document.getElementById("contentView").contentDocument.documentElement.classList.remove("dark");
	}
}

updateTheme(null, window.localStorage.getItem("theme"));
ipc.on("change-theme", updateTheme);


