# electron-document-manager
electron-document-manager is an [Electron](https://github.com/atom/electron) package that manages opening, saving and closing documents. All you have to do is drop in your web app, define `setContent` and `getContent` methods, and electron-document-manager will manage the rest – including everything in the main process.

Some of the document code is based on jdittrich's fantastic [Electron_appFileOperations](https://github.com/jdittrich/Electron_appFileOperations) script.

## Example Use
### Main Process
**main.js**
```js
var DocumentManager = require('electron-document-manager').main;

DocumentManager({ entryPoint: 'file://' + __dirname + '/app/index.html' });
```

### Renderer Process
**index.html**
```html
<textarea id="content"></textarea>
<script src="index.js"></script>
```

**index.js**
```js
var DocumentManager = require('electron-document-manager').getRendererModule();

DocumentManager.setContentSetter(function(content) {
	document.querySelector('#content').value = content;
});

DocumentManager.setContentGetter(function() {
	return document.querySelector('#content').value;
})

document.querySelector('#content').addEventListener('input', function() {
	DocumentManager.setEdited(true);
});
```
