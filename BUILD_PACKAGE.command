cd "`dirname "$0"`"

# Uses: https://github.com/electron-userland/electron-packager
# To install it globally:
#
#     npm install electron-packager -g
#

# Clean
rm -rf Inky-darwin-x64/
rm -rf Inky-win32-x64/
rm -rf Inky-win32-ia32/
rm -rf Inky-linux-x64/
rm -rf ReleaseUpload

# Create icon from PNG
./resources/makeIcns.command

# Ensure it's correctly/fully installed first
( cd app && npm install )

# Mac
electron-packager app Inky --platform=darwin --arch=x64 --icon=resources/Icon.icns --extend-info=resources/info.plist --app-bundle-id=com.inkle.inky --prune --asar.unpackDir="main-process/ink" --ignore="inklecate_win.exe"

# Windows 64 bit (requires Wine - `brew install wine`)
electron-packager app Inky --platform=win32  --arch=x64 --icon=resources/Icon1024.png.ico --prune --asar.unpackDir="main-process/ink" --ignore="inklecate_mac" --win32metadata.ProductName="Inky" --win32metadata.CompanyName="inkle Ltd" --win32metadata.FileDescription="Inky" --win32metadata.OriginalFilename="Inky" --win32metadata.InternalName="Inky"

# Windows 32 bit
electron-packager app Inky --platform=win32  --arch=ia32 --icon=resources/Icon1024.png.ico --prune --asar.unpackDir="main-process/ink" --ignore="inklecate_mac" --win32metadata.ProductName="Inky" --win32metadata.CompanyName="inkle Ltd" --win32metadata.FileDescription="Inky" --win32metadata.OriginalFilename="Inky" --win32metadata.InternalName="Inky"

# Linux
electron-packager app Inky --platform=linux --arch=x64 --icon=resources/Icon.icns --extend-info=resources/info.plist --prune --asar.unpackDir="main-process/ink" --ignore="inklecate_mac"

# Create a zip files ready for upload on Windows/Linux
mkdir -p ReleaseUpload
zip -r ReleaseUpload/Inky_windows_64.zip Inky-win32-x64
zip -r ReleaseUpload/Inky_windows_32.zip Inky-win32-ia32
zip -r ReleaseUpload/Inky_linux.zip Inky-linux-x64

# On Mac, create a DMG
# Requires appdmg: npm install -g appdmg
# https://www.npmjs.com/package/appdmg
appdmg resources/appdmg.json ReleaseUpload/Inky_mac.dmg

# Remove .icns again
rm resources/Icon.icns
