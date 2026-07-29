const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

const projectPath = path.join(__dirname, 'ios/CloudPassword.xcodeproj/project.pbxproj');
const myProj = xcode.project(projectPath);

myProj.parse(function (err) {
    if (err) {
        console.error('Error parsing project:', err);
        process.exit(1);
    }
    
    console.log('Successfully parsed project. Adding files...');
    
    // Add files to the project
    const groupName = 'CloudPassword'; // The group in Xcode to add to
    const targetName = 'CloudPassword';
    
    const swiftFile = myProj.addSourceFile('CloudPassword/VaultBridgeModule.swift', { target: myProj.findTargetKey('CloudPassword') }, myProj.findPBXGroupKey({ name: groupName }));
    const mFile = myProj.addSourceFile('CloudPassword/VaultBridgeModule.m', { target: myProj.findTargetKey('CloudPassword') }, myProj.findPBXGroupKey({ name: groupName }));
    
    if (swiftFile) {
        console.log('Added VaultBridgeModule.swift');
    }
    if (mFile) {
        console.log('Added VaultBridgeModule.m');
    }
    
    fs.writeFileSync(projectPath, myProj.writeSync());
    console.log('Saved project.pbxproj');
});
