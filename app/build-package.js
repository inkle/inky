const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const packager = require('@electron/packager');
const appdmg = require('appdmg');

const args = process.argv.slice(2);
const platforms = args.length ? args : ["mac", "windows", "linux"];


function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
                reject(stderr);
                return;
            }
            console.log(`Stdout: ${stdout}`);
            resolve(stdout);
        });
    });
}

// Clean
function deleteAtPath(relativePath) {
    let absPath = path.normalize(relativePath);
    if( fs.existsSync(absPath) ) {
        console.log("Cleaning "+absPath)
        fs.rmSync(absPath, { recursive: true, force: true });
    }
}

// Make DMG on Mac
async function makeDMG() {
    return new Promise((resolve, reject) => {
        const ee = appdmg({ 
            source: path.normalize("../resources/appdmg.json"), 
            target: path.normalize("../ReleaseUpload/Inky.dmg")
        });
        
        ee.on('progress', function (info) {
            if( info.type == "step-begin" ) {
                console.log(`[${info.current}/${info.total}]: ${info.title}`)
            }
        });
        
        ee.on('finish', function () {
            console.log("Successfully created Inky.dmg");
            resolve();
        });
        
        ee.on('error', function (err) {
            console.error("Error when creating Inky.dmg:", err);
            reject(err);
        });
    });
}



async function buildPackage() {
    
    // Clean
    if( platforms.includes("mac") ) {
        deleteAtPath("../Inky-darwin-x64");
        deleteAtPath("../Inky-darwin-arm64");
        deleteAtPath("../Inky-darwin-universal");
        deleteAtPath("../ReleaseUpload/Inky_mac.dmg")
    }
    if( platforms.includes("windows") ) {
        deleteAtPath("../Inky-win32-x64");
        deleteAtPath("../ReleaseUpload/Inky_windows_64.zip")
        deleteAtPath("../ReleaseUpload/Inky_windows_32.zip")
    }
    if( platforms.includes("linux") ) {
        deleteAtPath("../Inky-linux-x64");
        deleteAtPath("../ReleaseUpload/Inky_linux.zip")
    }
    
    // Mac: Create icon from PNG
    if( platforms.includes("mac") ) {
        runCommand("../resources/makeIcns.command");
    }
        
    const appPaths = await packager({
        dir: '.', // Source directory (app directory)
        out: "..",
        name: 'Inky', // App name
        platform: 'darwin', // Target platform
        arch: 'universal', // Target architecture
        overwrite: true, // Overwrite existing output
        icon: '../resources/Icon.icns', // Path to icon file
        extendInfo: '../resources/info.plist', // Path to extend-info file
        appBundleId: 'com.inkle.inky', // Application bundle ID
        prune: true, // Prune non-production dependencies
        asar: {
            unpackDir: 'main-process/ink' // Unpack specified directories
        },
        ignore: ['inklecate_win.exe', 'build-package.js'], // Ignore specified files
        osxSign: true, // Sign macOS apps,
        osxNotarize: {
            keychainProfile: 'notarisationKeychainPassword'
        }
    });
    
    // Create ReleaseUpload folder if necesscary
    let releaseFolderPath = path.normalize("../ReleaseUpload");
    if( !fs.existsSync(releaseFolderPath) ) {
        fs.mkdirSync(releaseFolderPath);
    }
    
    // Create .dmg on mac
    if( platforms.includes("mac") ) {
        await makeDMG();
    }

    // TODO: Create zips on other platforms


    if( platforms.includes("mac") ) {
        deleteAtPath("../resources/Icon.icns")
    }
    
    console.log('Build completed successfully.');
}


(async function tryBuildPackage() {
    try {
        await buildPackage();
    } catch (error) {
        console.error('Package build failed: ', error);
    }
})()