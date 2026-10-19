const baseConfig = require('./app.json').expo;

module.exports = ({ config }) => {
  const resolved = { ...baseConfig, ...config };
  const isIosPhoneBuild = process.env.MEFLIX_IOS_TARGET === 'phone';

  return {
    ...resolved,
    plugins: (resolved.plugins || []).map(plugin => {
      if (!Array.isArray(plugin) || plugin[0] !== '@react-native-tvos/config-tv') return plugin;
      return [plugin[0], { ...plugin[1], isTV: isIosPhoneBuild ? false : plugin[1]?.isTV }];
    }),
  };
};
