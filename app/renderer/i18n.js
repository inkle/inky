const { ipcRenderer } = require('electron');

class i18n {
    _(msgid) {
        return ipcRenderer.sendSync('i18n._', msgid);
    }
}

module.exports = new i18n();