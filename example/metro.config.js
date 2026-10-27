// Lets Metro bundle the library source from ../src while resolving every dependency from example/node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.join(root, 'src')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
// never pick up a second copy of react / react-native from the library root
config.resolver.blockList = [new RegExp(root.replace(/[\/]/g, '[\\/]') + '[\\/]node_modules[\\/].*')];
config.resolver.assetExts.push('epub');
module.exports = config;
