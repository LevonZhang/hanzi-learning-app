const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

module.exports = (async () => {
  const config = await getDefaultConfig(__dirname);
  
  config.watchFolders = [path.resolve(__dirname, 'src')];
  config.maxWorkers = 2;
  
  config.transformer = {
    ...config.transformer,
    assetPlugins: ['expo-asset/tools/hashAssetFiles'],
    minifierConfig: {
      keep_classnames: true,
      keep_fnames: true,
      mangle: {
        keep_classnames: true,
        keep_fnames: true
      }
    }
  };

  return config;
})(); 