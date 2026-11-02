const electron = require('electron');

class i18n {
    constructor() {
        this.currentLocale = 'en';
        this.msgs = {};

        electron.app.on('ready', () => {
            this.switch();
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

    switch() {
        this.currentLocale = 'en';
        this.msgs = {};
    }
}

module.exports = new i18n();