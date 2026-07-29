const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withAndroidAutofillService = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    const serviceConfig = {
      $: {
        'android:name': '.VaultAutofillService',
        'android:label': 'Cloud Password',
        'android:permission': 'android.permission.BIND_AUTOFILL_SERVICE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.service.autofill.AutofillService' } }
          ]
        }
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.autofill',
            'android:resource': '@xml/autofill_service_config'
          }
        }
      ]
    };

    if (!mainApplication.service) {
      mainApplication.service = [];
    }
    const hasService = mainApplication.service.some(s => s.$['android:name'] === '.VaultAutofillService');
    if (!hasService) {
      mainApplication.service.push(serviceConfig);
    }
    return config;
  });
};

const withAndroidAutofillFiles = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageName = config.android?.package || 'com.drbarret.privatevault';
      const packagePath = packageName.replace(/\./g, '/');
      
      const javaDir = path.join(projectRoot, 'android/app/src/main/java', packagePath);
      const resDir = path.join(projectRoot, 'android/app/src/main/res/xml');
      
      // Ensure directories exist
      fs.mkdirSync(javaDir, { recursive: true });
      fs.mkdirSync(resDir, { recursive: true });

      const backupRoot = path.join(projectRoot, '../../scratch/android_backup');
      
      const javaFiles = ['VaultAutofillService.kt', 'VaultBridgeModule.kt', 'VaultBridgePackage.kt'];
      for (const file of javaFiles) {
        const src = path.join(backupRoot, 'java', file);
        const dest = path.join(javaDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`[withAutofill] Copied Java file ${file} to ${dest}`);
        }
      }

      const xmlFiles = ['autofill_service_config.xml', 'secure_store_backup_rules.xml', 'secure_store_data_extraction_rules.xml'];
      for (const file of xmlFiles) {
        const src = path.join(backupRoot, 'xml', file);
        const dest = path.join(resDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`[withAutofill] Copied XML resource file ${file} to ${dest}`);
        }
      }

      return config;
    },
  ]);
};

const { withMainApplication } = require('@expo/config-plugins');

const withVaultBridgePackage = (config) => {
  return withMainApplication(config, async (config) => {
    let mainApp = config.modResults.contents;
    const packageName = config.android?.package || 'com.drbarret.privatevault';
    const injection = `add(${packageName}.VaultBridgePackage())`;
    if (!mainApp.includes(injection)) {
      mainApp = mainApp.replace(
          /(\/\/ add\(MyReactNativePackage\(\)\))/g,
          `$1\n              ${injection}`
      );
      config.modResults.contents = mainApp;
    }
    return config;
  });
};

const withIosAutofill = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      console.log('▶ [Expo Config Plugin] Running add_ios_extension target injection hook...');
      
      const addIosExtension = require('./add_ios_extension_logic');
      await addIosExtension(projectRoot);
      
      return config;
    }
  ]);
};

module.exports = function withAutofill(config) {
  config = withAndroidAutofillService(config);
  config = withAndroidAutofillFiles(config);
  config = withVaultBridgePackage(config);
  config = withIosAutofill(config);
  return config;
};
