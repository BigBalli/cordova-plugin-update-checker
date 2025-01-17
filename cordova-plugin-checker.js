const path = require('path');
const fs = require('fs');
const exec = require('child_process').exec;
const util = require('util');
const readline = require('readline');
const execPromise = util.promisify(exec);

// Console colors
const colors = {
    green: '\x1b[32m',
    reset: '\x1b[0m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const parsePluginList = (output) => {
    // Split output into lines and filter empty lines
    const lines = output.split('\n').filter(line => line.trim());
    
    // Parse each line to extract plugin ID and version
    return lines.map(line => {
        // Remove any ">" or spaces from the beginning
        const cleanLine = line.replace(/^[>\s]+/, '');
        
        // Extract plugin ID and version
        // Example format: "cordova-plugin-name 1.0.0"
        const [id, version] = cleanLine.split(' ');
        
        return {
            id: id,
            version: version || 'unknown'
        };
    }).filter(plugin => plugin.id && plugin.id !== 'undefined');
};

const updatePlugin = async (pluginId) => {
    try {
        console.log(`\nUpdating ${pluginId}...`);
        await execPromise(`cordova plugin remove ${pluginId} --force`);
        await execPromise(`cordova plugin add ${pluginId}`);
        console.log(`${colors.green}Successfully updated ${pluginId}${colors.reset}`);
        return true;
    } catch (error) {
        console.error(`${colors.red}Failed to update ${pluginId}: ${error}${colors.reset}`);
        return false;
    }
};

const checkPluginUpdates = async (projectPath) => {
    try {
        // Validate if the path exists and contains a Cordova project
        if (!fs.existsSync(projectPath)) {
            throw new Error(`Project path does not exist: ${projectPath}`);
        }

        // Check for config.xml to verify it's a Cordova project
        const configPath = path.join(projectPath, 'config.xml');
        if (!fs.existsSync(configPath)) {
            throw new Error(`Not a Cordova project: ${projectPath} (config.xml not found)`);
        }

        // Change to project directory
        const originalDir = process.cwd();
        process.chdir(projectPath);

        // Get list of installed plugins (without --json flag)
        const { stdout: pluginListOutput } = await execPromise('cordova plugin list');
        const installedPlugins = parsePluginList(pluginListOutput);

        // Initialize results array
        const updateResults = [];

        // Check each plugin
        for (const plugin of installedPlugins) {
            try {
                if (!plugin.id || plugin.id === 'undefined') continue;

                // Get npm info for the plugin
                const { stdout: npmInfo } = await execPromise(`npm view ${plugin.id} version`);
                const latestVersion = npmInfo.trim();
                const currentVersion = plugin.version;

                // Compare versions
                const hasUpdate = compareVersions(currentVersion, latestVersion);
                
                updateResults.push({
                    plugin: plugin.id,
                    currentVersion,
                    latestVersion,
                    hasUpdate,
                });
            } catch (error) {
                console.error(`Error checking plugin ${plugin.id}:`, error);
                updateResults.push({
                    plugin: plugin.id,
                    currentVersion: plugin.version,
                    error: 'Failed to check for updates'
                });
            }
        }

        return updateResults;
    } catch (error) {
        throw new Error(`Failed to check plugin updates: ${error.message}`);
    }
};

// Version comparison utility
const compareVersions = (current, latest) => {
    if (current === 'unknown') return true;
    
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if (latestParts[i] > currentParts[i]) {
            return true;
        } else if (latestParts[i] < currentParts[i]) {
            return false;
        }
    }
    return false;
};

const checkUpdates = async () => {
    try {
        // Get project path from command line argument or use current directory
        const projectPath = process.argv[2] || '.';
        const absolutePath = path.resolve(projectPath);

        console.log(`Checking plugins in project: ${absolutePath}`);
        
        const results = await checkPluginUpdates(absolutePath);
        console.log('\nPlugin Update Check Results:');
        
        // Keep track of plugins that need updates
        const pluginsToUpdate = [];
        
        results.forEach(result => {
            if (result.error) {
                console.log(`${colors.red}${result.plugin}: ${result.error}${colors.reset}`);
            } else {
                const updateStatus = result.hasUpdate 
                    ? `${colors.green}Yes - update available!${colors.reset}`
                    : 'No';
                    
                console.log(`
    Plugin: ${result.plugin}
    Current Version: ${result.currentVersion}
    Latest Version: ${result.latestVersion}
    Update Available: ${updateStatus}
                `);

                if (result.hasUpdate) {
                    pluginsToUpdate.push(result);
                }
            }
        });

        // If there are plugins to update, ask user for each one
        if (pluginsToUpdate.length > 0) {
            for (const plugin of pluginsToUpdate) {
                const answer = await question(
                    `\nDo you want to update ${plugin.plugin} from ${plugin.currentVersion} to ${plugin.latestVersion}? (y/n): `
                );
                
                if (answer.toLowerCase() === 'y') {
                    await updatePlugin(plugin.plugin);
                }
            }
        } else {
            console.log('\nAll plugins are up to date!');
        }

        rl.close();
    } catch (error) {
        console.error(`${colors.red}Failed to check plugin updates: ${error}${colors.reset}`);
        rl.close();
        process.exit(1);
    }
};

// Run the check
checkUpdates();