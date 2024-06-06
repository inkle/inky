cd "`dirname "$0"`"

# Uses: https://github.com/electron-userland/electron-packager
# To install it globally:
#
#     npm install electron-packager -g
#

# Clean
rm -rf Inky-linux-x64/
rm -rf ReleaseUpload

# Ensure it's correctly/fully installed first
( cd app && npm install )

# Linux
electron-packager app Inky --platform=linux --arch=x64 --icon=resources/Icon.icns --extend-info=resources/info.plist --prune --asar.unpackDir="main-process/ink" --ignore="inklecate_mac"

# Create a zip files ready for upload on Windows/Linux
mkdir -p ReleaseUpload
zip -r ReleaseUpload/Inky_linux.zip Inky-linux-x64

#Prepare AppImage build structure
mkdir -p AppImage/opt/inky
mkdir -p AppImage/usr/share/pixmaps

cp resources/AppRun AppImage/
cp resources/com.inkle.inky.desktop AppImage/
cp resources/Icon1024.png AppImage/inky.png
cp resources/Icon1024.png AppImage/usr/share/pixmaps/inky.png
cp -r Inky-linux-x64/* AppImage/opt/inky/

#Build AppImage File ready for upload
ARCH=x86_64 ./build/appimagetool-x86_64.AppImage -n AppImage ReleaseUpload/Inky.AppImage
