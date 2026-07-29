const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

module.exports = function addIosExtension(projectRoot) {
    return new Promise((resolve, reject) => {
        const projectPath = path.join(projectRoot, 'ios/CloudPassword.xcodeproj/project.pbxproj');
        if (!fs.existsSync(projectPath)) {
            console.log('project.pbxproj not found, skipping iOS target injection.');
            return resolve();
        }
        
        const myProj = xcode.project(projectPath);
        myProj.parse(function (err) {
            if (err) {
                console.error('Error parsing project:', err);
                return reject(err);
            }
            
            const targetName = 'CredentialProvider';
            const bundleId = 'com.drbarret.privatevault.CredentialProvider';
            
            // Check if target already exists
            const nativeTargets = myProj.pbxNativeTargetSection();
            let exists = false;
            for (const key in nativeTargets) {
                if (nativeTargets[key].name === `"${targetName}"` || nativeTargets[key].name === targetName) {
                    exists = true;
                    break;
                }
            }
            
            const xcConfigList = myProj.pbxXCConfigurationList();
            const buildConfigs = myProj.pbxXCBuildConfigurationSection();
            
            // Ensure scratch source files are copied into the actual ios directory
            const cpSrcDir = path.join(projectRoot, 'ios/CredentialProvider');
            const cpBaseLproj = path.join(cpSrcDir, 'Base.lproj');
            fs.mkdirSync(cpBaseLproj, { recursive: true });
            
            const mainAppIosDir = path.join(projectRoot, 'ios/CloudPassword');
            fs.mkdirSync(mainAppIosDir, { recursive: true });

            const backupRoot = path.join(projectRoot, '../../scratch/ios_backup');
            
            const filesToCopy = [
                { src: 'CredentialProvider/CredentialProviderViewController.swift', dest: 'ios/CredentialProvider/CredentialProviderViewController.swift' },
                { src: 'CredentialProvider/Info.plist', dest: 'ios/CredentialProvider/Info.plist' },
                { src: 'CredentialProvider/CredentialProvider.entitlements', dest: 'ios/CredentialProvider/CredentialProvider.entitlements' },
                { src: 'CredentialProvider/Base.lproj/MainInterface.storyboard', dest: 'ios/CredentialProvider/Base.lproj/MainInterface.storyboard' },
                { src: 'VaultBridgeModule.swift', dest: 'ios/CloudPassword/VaultBridgeModule.swift' },
                { src: 'VaultBridgeModule.m', dest: 'ios/CloudPassword/VaultBridgeModule.m' }
            ];

            for (const f of filesToCopy) {
                const srcPath = path.join(backupRoot, f.src);
                const destPath = path.join(projectRoot, f.dest);
                if (fs.existsSync(srcPath)) {
                    fs.copyFileSync(srcPath, destPath);
                    console.log(`Copied ${f.src} to ${f.dest}`);
                }
            }
            
            if (exists) {
                console.log('Target CredentialProvider already exists. Updating existing target build settings...');
                const targetKey = Object.keys(nativeTargets).find(key => nativeTargets[key].name === `"${targetName}"` || nativeTargets[key].name === targetName);
                if (targetKey) {
                    const target = nativeTargets[targetKey];
                    const targetConfigListUuid = target.buildConfigurationList;
                    const targetConfigs = xcConfigList[targetConfigListUuid].buildConfigurations;
                    
                    for (const item of targetConfigs) {
                        const configUuid = item.value;
                        const config = buildConfigs[configUuid];
                        if (config) {
                            config.buildSettings.CODE_SIGN_ENTITLEMENTS = '"CredentialProvider/CredentialProvider.entitlements"';
                            config.buildSettings.INFOPLIST_FILE = '"CredentialProvider/Info.plist"';
                            config.buildSettings.DEVELOPMENT_TEAM = '"6UJ8GS752W"';
                            config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1';
                            config.buildSettings.CODE_SIGN_STYLE = 'Automatic';
                            config.buildSettings.SWIFT_VERSION = '5.0';
                            config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
                            config.buildSettings.GENERATE_INFOPLIST_FILE = 'YES';
                            config.buildSettings.MARKETING_VERSION = '"1.0"';
                            config.buildSettings.CURRENT_PROJECT_VERSION = '"1"';
                        }
                    }
                }
            } else {
                // Workaround for xcode npm package bug: create a dummy "Resources" group so addResourceFile doesn't crash
                if (!myProj.pbxGroupByName('Resources')) {
                    myProj.addPbxGroup([], 'Resources', 'Resources');
                }

                // Add the target
                const target = myProj.addTarget(targetName, 'app_extension', 'CredentialProvider', bundleId);
                const targetUuid = target.uuid;
                
                console.log('Added target CredentialProvider with UUID:', targetUuid);
                
                // Explicitly add build phases for the extension target so it compiles code and packages resources
                myProj.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', targetUuid);
                myProj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetUuid);
                myProj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', targetUuid);
                
                // Add an empty group first to avoid premature file-ref generation bug
                const group = myProj.addPbxGroup([], targetName, targetName);
                
                // Add files to target, registering them correctly in the respective build phases
                myProj.addSourceFile('CredentialProvider/CredentialProviderViewController.swift', { target: targetUuid }, group.uuid);
                myProj.addResourceFile('CredentialProvider/Base.lproj/MainInterface.storyboard', { target: targetUuid }, group.uuid);
                myProj.addFile('CredentialProvider/Info.plist', group.uuid);
                myProj.addFile('CredentialProvider/CredentialProvider.entitlements', group.uuid);
                
                // Update build settings for target
                const targetConfigListUuid = target.pbxNativeTarget.buildConfigurationList;
                const targetConfigs = xcConfigList[targetConfigListUuid].buildConfigurations;
                
                for (const item of targetConfigs) {
                    const configUuid = item.value;
                    const config = buildConfigs[configUuid];
                    if (config) {
                        config.buildSettings.CODE_SIGN_ENTITLEMENTS = '"CredentialProvider/CredentialProvider.entitlements"';
                        config.buildSettings.INFOPLIST_FILE = '"CredentialProvider/Info.plist"';
                        config.buildSettings.DEVELOPMENT_TEAM = '"6UJ8GS752W"';
                        config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '15.1';
                        config.buildSettings.CODE_SIGN_STYLE = 'Automatic';
                        config.buildSettings.SWIFT_VERSION = '5.0';
                        config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
                        config.buildSettings.GENERATE_INFOPLIST_FILE = 'YES';
                        config.buildSettings.MARKETING_VERSION = '"1.0"';
                        config.buildSettings.CURRENT_PROJECT_VERSION = '"1"';
                    }
                }
            }
            
            // Add VaultBridgeModule to main target
            const mainTargetKey = myProj.findTargetKey('CloudPassword');
            const mainGroupName = 'CloudPassword';
            const mainGroupKey = myProj.findPBXGroupKey({ name: mainGroupName });
            
            if (!myProj.hasFile('CloudPassword/VaultBridgeModule.swift')) {
                myProj.addSourceFile('CloudPassword/VaultBridgeModule.swift', { target: mainTargetKey }, mainGroupKey);
            }
            if (!myProj.hasFile('CloudPassword/VaultBridgeModule.m')) {
                myProj.addSourceFile('CloudPassword/VaultBridgeModule.m', { target: mainTargetKey }, mainGroupKey);
            }
            
            // Update main target build settings
            if (mainTargetKey) {
                const mainTarget = nativeTargets[mainTargetKey] || nativeTargets[`${mainTargetKey}_comment`] || myProj.pbxNativeTargetSection()[mainTargetKey];
                if (mainTarget) {
                    const mainTargetConfigListUuid = mainTarget.buildConfigurationList;
                    const mainConfigList = xcConfigList[mainTargetConfigListUuid] || xcConfigList[`${mainTargetConfigListUuid}_comment`];
                    if (mainConfigList && mainConfigList.buildConfigurations) {
                        for (const item of mainConfigList.buildConfigurations) {
                            const configUuid = item.value;
                            const config = buildConfigs[configUuid];
                            if (config) {
                                config.buildSettings.CODE_SIGN_ENTITLEMENTS = '"CloudPassword/CloudPassword.entitlements"';
                                config.buildSettings.DEVELOPMENT_TEAM = '"6UJ8GS752W"';
                            }
                        }
                    }
                }
            }
            
            fs.writeFileSync(projectPath, myProj.writeSync());
            console.log('Saved project.pbxproj successfully.');
            resolve();
        });
    });
};
