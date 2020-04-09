const electron = require("electron");
const ipc = electron.ipcRenderer;

ipc.on("change-theme", (event, newTheme) => {
  if (newTheme.toLowerCase() === 'dark') {
    document.body.classList.add("dark");
    document.getElementById("contentView").contentDocument.documentElement.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
		document.getElementById("contentView").contentDocument.documentElement.classList.remove("dark");
  }
});

