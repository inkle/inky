const {remote} = require('electron')
const {Menu, MenuItem} = remote
const SpellChecker = require("./spellChecker.js")

const playerViewMenu = new Menu()
playerViewMenu.append(new MenuItem({ role: 'copy' }))
playerViewMenu.append(new MenuItem({ role: 'selectall' }))

window.addEventListener('contextmenu', (e) => {
    e.preventDefault()

    const editor = ace.edit("editor")
    if (e.target == editor.textInput.getElement()) {
        var template = [
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectall' }
        ];

        template = withSpellingSuggestions(template, editor)

        const menu = Menu.buildFromTemplate(template)
        menu.popup(remote.getCurrentWindow())
    } else {
        playerViewMenu.popup(remote.getCurrentWindow())
    }
}, false);

function withSpellingSuggestions(template, editor) {
    const pos = editor.getCursorPosition()
    var suggestions = SpellChecker.getSuggestions(pos)
    if (suggestions instanceof Array) {
        suggestions = suggestions.map(suggestion => {
            return {
                label: suggestion.word,
                click() {
                    editor.getSession().getDocument().replace(suggestion.where, suggestion.word)
                }
            }
        })
        if (!suggestions.length) {
            suggestions = [{ label: 'No Guesses Found' }]
        }
        template = suggestions.slice(0, 3).concat({ type: 'separator' }, template)
    }
    return template
}
