# Ensure it's correctly/fully installed first
cd app
npm install
cd ..

electron-packager app Inky --platform=win32  --arch=x64 --icon=resources/Icon1024.png.ico --prune --asar.unpackDir="main-process/ink" --ignore="inklecate_mac" --win32metadata.ProductName="Inky" --win32metadata.CompanyName="inkle Ltd" --win32metadata.FileDescription="Inky" --win32metadata.OriginalFilename="Inky" --win32metadata.InternalName="Inky"