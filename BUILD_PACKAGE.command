cd "`dirname "$0"`"

# Uses: https://github.com/electron-userland/electron-packager
# To install it globally:
#
#     npm install electron-packager -g
#

# Clean
rm -rf Inky-darwin-x64/
rm -rf Inky-win32-x64/
rm -rf Inky-linux-x64/
rm -rf ReleaseUpload

# Create icon from PNG
./resources/makeIcns.command

# Mac
electron-packager app Inky --platform=darwin  --arch=x64 --icon=resources/Icon.icns --extend-info=resources/info.plist --prune --asar --asar-unpack-dir="main-process/ink" --ignore="inklecate_win.exe"

# Windows (requires Wine - `brew install wine`)
electron-packager app Inky --platform=win32  --arch=x64 --icon=resources/Icon1024.png.ico --prune --asar --asar-unpack-dir="main-process/ink" --ignore="inklecate_mac" --version-string.ProductName="Inky" --version-string.CompanyName="inkle Ltd" --version-string.FileDescription="Inky" --version-string.OriginalFilename="Inky" --version-string.InternalName="Inky"

# Linux
electron-packager app Inky --platform=linux  --arch=x64 --icon=resources/Icon.icns --extend-info=resources/info.plist --prune --asar --asar-unpack-dir="main-process/ink" --ignore="inklecate_mac"

# Remove .icns again
rm resources/Icon.icns

# Create a zip file ready for upload
mkdir -p ReleaseUpload
zip -r ReleaseUpload/Inky_mac.zip Inky-darwin-x64/Inky.app
zip -r ReleaseUpload/Inky_windows.zip Inky-win32-x64
zip -r ReleaseUpload/Inky_linux.zip Inky-linux-x64
