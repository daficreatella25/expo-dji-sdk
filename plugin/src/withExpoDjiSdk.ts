import { ConfigPlugin, withAndroidManifest, WarningAggregator, withDangerousMod, withProjectBuildGradle, withAppBuildGradle } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

export interface ExpoDjiSdkPluginProps {
  /**
   * DJI API Key for accessing DJI SDK services
   */
  apiKey?: string;
}

const withExpoDjiSdk: ConfigPlugin<ExpoDjiSdkPluginProps> = (config, props = {}) => {
  const { apiKey } = props;

  if (!apiKey) {
    WarningAggregator.addWarningAndroid(
      'expo-dji-sdk',
      'No DJI API key provided. Please add your DJI API key to the plugin configuration in app.json/app.config.js'
    );
    return config;
  }

  // Modify Android manifest
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    
    if (!androidManifest.manifest) {
      throw new Error('Android manifest is missing');
    }

    if (!androidManifest.manifest.application) {
      androidManifest.manifest.application = [{ $: { 'android:name': 'android.app.Application' } }];
    }

    const application = androidManifest.manifest.application![0];
    
    if (!application['meta-data']) {
      application['meta-data'] = [];
    }

    // Remove existing DJI API key meta-data if present
    application['meta-data'] = application['meta-data'].filter(
      (meta: any) => meta.$?.['android:name'] !== 'com.dji.sdk.API_KEY'
    );

    // Add the DJI API key meta-data
    application['meta-data'].push({
      $: {
        'android:name': 'com.dji.sdk.API_KEY',
        'android:value': apiKey,
      },
    });

    return config;
  });

  // Modify MainApplication to add DJI SDK initialization
  config = withMainApplication(config);

  // Configure project-level build.gradle
  config = withProjectBuildGradle(config, (config) => {
    const { contents } = config.modResults;
    
    // Add DJI Maven repository if not present
    if (!contents.includes('artifact.dji-innovations.com')) {
      let modifiedContents = contents;
      
      // Find allprojects repositories block and add DJI repo
      const allProjectsMatch = modifiedContents.match(/(allprojects\s*\{[\s\S]*?repositories\s*\{[\s\S]*?)(}\s*})/);
      if (allProjectsMatch) {
        const beforeClosing = allProjectsMatch[1];
        const afterClosing = allProjectsMatch[2];
        
        modifiedContents = modifiedContents.replace(
          allProjectsMatch[0],
          `${beforeClosing}
    maven {
      url "https://artifact.dji-innovations.com/repository/registry/"
    }
  ${afterClosing}`
        );
      }
      
      config.modResults.contents = modifiedContents;
    }
    
    return config;
  });

  // Configure app-level build.gradle
  config = withAppBuildGradle(config, (config) => {
    let { contents } = config.modResults;
    
    // Add react configuration block after plugins if not present
    if (!contents.includes('react {')) {
      const pluginsMatch = contents.match(/(apply plugin:[\s\S]*?)(\n\n|\n(?=[a-zA-Z]))/);
      if (pluginsMatch) {
        const reactConfig = `
def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()

/**
 * This is the configuration block to customize your React Native Android app.
 * By default you don't need to apply any configuration, just uncomment the lines you need.
 */
react {
    entryFile = file(["node", "-e", "require('expo/scripts/resolveAppEntry')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())
    reactNativeDir = new File(["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()
    hermesCommand = new File(["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/sdks/hermesc/%OS-BIN%/hermesc"
    codegenDir = new File(["node", "--print", "require.resolve('@react-native/codegen/package.json', { paths: [require.resolve('react-native/package.json')] })"].execute(null, rootDir).text.trim()).getParentFile().getAbsoluteFile()

    enableBundleCompression = (findProperty('android.enableBundleCompression') ?: false).toBoolean()
    // Use Expo CLI to bundle the app, this ensures the Metro config
    // works correctly with Expo projects.
    cliFile = new File(["node", "--print", "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })"].execute(null, rootDir).text.trim())
    bundleCommand = "export:embed"

    /* Autolinking */
    autolinkLibrariesWithApp()
}

/**
 * Set this to true to Run Proguard on Release builds to minify the Java bytecode.
 */
def enableProguardInReleaseBuilds = false

/**
 * The preferred build flavor of JavaScriptCore (JSC)
 */
def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'

`;
        contents = contents.replace(pluginsMatch[0], pluginsMatch[1] + reactConfig + pluginsMatch[2]);
      }
    }

    // Add NDK configuration to android defaultConfig if not present
    if (!contents.includes('ndk {')) {
      const defaultConfigMatch = contents.match(/(defaultConfig\s*\{[\s\S]*?)((\n\s*})|$)/);
      if (defaultConfigMatch) {
        const beforeClosing = defaultConfigMatch[1];
        const afterClosing = defaultConfigMatch[2];
        
        if (!beforeClosing.includes('multiDexEnabled')) {
          contents = contents.replace(
            defaultConfigMatch[0],
            `${beforeClosing}
        multiDexEnabled true
        
        ndk {
            abiFilters 'arm64-v8a'
        }${afterClosing}`
          );
        } else if (!beforeClosing.includes('ndk {')) {
          contents = contents.replace(
            defaultConfigMatch[0],
            `${beforeClosing}        
        ndk {
            abiFilters 'arm64-v8a'
        }${afterClosing}`
          );
        }
      }
    }
    
    // Add DJI SDK dependencies if not present
    if (!contents.includes('dji-sdk-v5-aircraft')) {
      // Find dependencies block and add DJI dependencies
      const dependenciesMatch = contents.match(/(dependencies\s*\{[\s\S]*?)(}\s*$)/m);
      if (dependenciesMatch) {
        const beforeClosing = dependenciesMatch[1];
        const afterClosing = dependenciesMatch[2];
        
        contents = contents.replace(
          dependenciesMatch[0],
          `${beforeClosing}
    // DJI SDK V5 dependencies
    implementation 'com.dji:dji-sdk-v5-aircraft:5.15.0'
    compileOnly 'com.dji:dji-sdk-v5-aircraft-provided:5.15.0'
    implementation 'com.dji:dji-sdk-v5-networkImp:5.15.0'
    
    // MultiDex support
    implementation 'androidx.multidex:multidex:2.0.1'
${afterClosing}`
        );
      }
    }
      
    // DJI native libraries are handled by the existing packagingOptions block in the template

    config.modResults.contents = contents;
    return config;
  });

  return config;
};

const withMainApplication: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const mainApplicationPath = path.join(
        config.modRequest.platformProjectRoot!,
        'app/src/main/java'
      );
      
      // Find MainApplication.kt file
      const findMainApplication = (dir: string): string | null => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            const result = findMainApplication(fullPath);
            if (result) return result;
          } else if (entry.name === 'MainApplication.kt') {
            return fullPath;
          }
        }
        return null;
      };

      const mainAppFile = findMainApplication(mainApplicationPath);
      if (!mainAppFile) {
        WarningAggregator.addWarningAndroid(
          'expo-dji-sdk',
          'MainApplication.kt not found, skipping DJI SDK initialization injection'
        );
        return config;
      }

      let contents = fs.readFileSync(mainAppFile, 'utf8');
      
      // Check if DJI security helper is already added
      if (contents.includes('com.cySdkyc.clx.Helper.install')) {
        return config;
      }

      // Add the import if not present
      if (!contents.includes('import android.content.Context')) {
        contents = contents.replace(
          'import android.app.Application',
          'import android.app.Application\nimport android.content.Context'
        );
      }

      // Find attachBaseContext method or create it
      if (contents.includes('override fun attachBaseContext')) {
        // Method exists, add DJI SDK security helper installation
        if (!contents.includes('com.cySdkyc.clx.Helper.install')) {
          contents = contents.replace(
            /(override fun attachBaseContext\(base: Context\?\) \{[\s\S]*?super\.attachBaseContext\(base\))/,
            `$1
    // Install DJI SDK security helper - MUST be called before using any SDK functionality
    com.cySdkyc.clx.Helper.install(this)`
          );
        }
      } else {
        // Method doesn't exist, add it with DJI SDK security helper installation
        const classDeclaration = /class\s+\w+\s*:\s*Application\(\)[^{]*\{/;
        contents = contents.replace(
          classDeclaration,
          `$&

  override fun attachBaseContext(base: Context?) {
    super.attachBaseContext(base)
    // Install DJI SDK security helper - MUST be called before using any SDK functionality
    com.cySdkyc.clx.Helper.install(this)
  }`
        );
      }

      fs.writeFileSync(mainAppFile, contents);
      return config;
    },
  ]);
};

export default withExpoDjiSdk;