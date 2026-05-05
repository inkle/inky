const electron = require('electron');
const BrowserWindow = electron.BrowserWindow;
const path = require("path");
const fs = require("fs");
const inkjsPackage = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'inkjs', 'package.json'), 'utf8'));
const i18n = require('./i18n/i18n.js');


const electronWindowOptions = {
    width: 340,
    height: 270,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
        preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
        nodeIntegration: true,
        contextIsolation: false
    }
};

const versionFilePath = "ink/version.txt";
const inklecateRootPathRelease = path.join(__dirname, "../../app.asar.unpacked/main-process");
const inklecateRootPathDev = __dirname;
var fullVersionFilePath = path.join(inklecateRootPathRelease, versionFilePath);

try { fs.accessSync(versionFilePath) }
catch(e) {
    fullVersionFilePath = path.join(inklecateRootPathDev, versionFilePath);
}


var inkVersion = fs.readFileSync(fullVersionFilePath, "utf8");

var aboutWindow = null;


function AboutWindow(theme) {
    electronWindowOptions.title = i18n._("About Inky");

    var w = new BrowserWindow(electronWindowOptions);
    w.loadURL("file://" + __dirname + "/../renderer/about/about.html");

    w.webContents.on("did-finish-load", () => {
        w.webContents.send("set-about-data", {
            "inkyVersion": electron.app.getVersion(),
            "inkVersion": inkVersion,
            "inkjsVersion": inkjsPackage.version
        });
        w.webContents.send("change-theme", theme);
        w.setMenu(null);
        w.show();
    });

    this.browserWindow = w;

    w.on("close", () => {
        aboutWindow = null;
    });
}
AboutWindow.showAboutWindow = function (theme) {
    if( aboutWindow == null ) {
        aboutWindow = new AboutWindow(theme);
        return aboutWindow;
    }
}
AboutWindow.changeTheme = function (theme) {
    if( aboutWindow != null ) {
        aboutWindow.browserWindow.webContents.send("change-theme", theme);
    }
}

exports.AboutWindow = AboutWindow;