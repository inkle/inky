const electron = require('electron');
const fs = require('fs');
const path = require('path');

class i18n {
    constructor() {
        this.currentLocale = null;
        this.msgs = {}

        electron.app.on('ready', () => {
            this.switch(electron.app.getLocale());
        });

        electron.ipcMain.on('i18n._', (event, msgid) => {
            event.returnValue = this._(msgid);
        });
    }

    _(msgid) {
        if (!(msgid in this.msgs) || !this.msgs[msgid].length) {
            this.msgs[msgid] = msgid;
        }
        return this.msgs[msgid];
    }

    switch(lang) {
        this.currentLocale = lang;
        const file = path.join(__dirname, `${lang}.json`)
        if (fs.existsSync(file)) {
            this.msgs = require(file);
        } else {
            const defaultLocale = electron.app.getLocale();
            if (lang != defaultLocale) {
                this.switch(defaultLocale);
            }
        }
    }
}

module.exports = new i18n();