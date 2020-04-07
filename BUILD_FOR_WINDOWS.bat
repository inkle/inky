@echo off
REM Uses: https://github.com/electron-userland/electron-packager
REM To install it globally:
REM
REM     npm install electron-packager -g
REM

REM Ensure it's correctly/fully installed first
cd app
call npm install
cd ..

REM Remove old build
rmdir /S /Q Inky-win32-x64
rmdir /S /Q ReleaseUpload

REM Build
call electron-packager app Inky --platform=win32  --arch=x64 --icon=resources/Icon1024.png.ico --prune --asar.unpackDir="main-process/ink" --ignore="inklecate_mac" --win32metadata.ProductName="Inky" --win32metadata.CompanyName="inkle Ltd" --win32metadata.FileDescription="Inky" --win32metadata.OriginalFilename="Inky" --win32metadata.InternalName="Inky"

REM zip if powershell is available
powershell /? >nul 2>&1 && (
	md ReleaseUpload
	powershell Compress-Archive Inky-win32-x64 ReleaseUpload\Inky-win32-x64.zip 
)