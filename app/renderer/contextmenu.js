const {ipcRenderer} = require("electron")

// renderer
window.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    ipcRenderer.send('show-context-menu')
  })