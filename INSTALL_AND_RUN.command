cd "`dirname "$0"`"
cd app
npm install && ./node_modules/.bin/electron-rebuild && npm start