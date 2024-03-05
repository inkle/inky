const {remote} = require('electron')
const i18n = require('./i18n')
const {Menu, MenuItem} = remote

const menu = new Menu()
menu.append(new MenuItem({ role: 'cut' ,label:i18n._('Cut')}))
menu.append(new MenuItem({ role: 'copy' ,label:i18n._('Copy')}))
menu.append(new MenuItem({ role: 'paste' ,label:i18n._('Paste')}))
menu.append(new MenuItem({ role: 'selectall' ,label:i18n._('Select All')}))

window.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    menu.popup(remote.getCurrentWindow())
}, false);