cd "`dirname "$0"`"

# Clean
rm -rf Inky-darwin-arm64/
rm ReleaseUpload/Inky_mac.dmg

# Ensure it's correctly/fully installed first
( cd app && npm install )

# Create icon from PNG
./resources/makeIcns.command

# Mac
npm exec @electron/packager app Inky --platform=darwin --arch=arm64 --icon=./resources/Icon.icns --extend-info=./resources/info.plist --app-bundle-id=com.inkle.inky --prune --asar.unpackDir="main-process/ink" --ignore="inklecate_win.exe" --overwrite

# Create a DMG
# Requires appdmg: npm install -g appdmg
# https://www.npmjs.com/package/appdmg
mkdir -p ReleaseUpload
npm exec appdmg resources/appdmg.json ReleaseUpload/Inky_mac.dmg

# Remove .icns again
rm resources/Icon.icns
