const {
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
} = require('@expo/config-plugins');

function ensureArray(parent, key) {
  if (!parent[key]) {
    parent[key] = [];
  }

  if (!Array.isArray(parent[key])) {
    parent[key] = [parent[key]];
  }

  return parent[key];
}

function setColor(resources, name, value) {
  const colors = ensureArray(resources.resources, 'color');
  const color = colors.find((item) => item.$?.name === name);

  if (color) {
    color._ = value;
    return;
  }

  colors.push({ $: { name }, _: value });
}

function setStyleItem(resources, styleName, itemName, value) {
  const styles = ensureArray(resources.resources, 'style');
  const style = styles.find((item) => item.$?.name === styleName);

  if (!style) {
    return;
  }

  const items = ensureArray(style, 'item');
  const existing = items.find((item) => item.$?.name === itemName);

  if (existing) {
    existing._ = value;
    return;
  }

  items.push({ $: { name: itemName }, _: value });
}

module.exports = function withSplashIdentity(config) {
  config = withAndroidColors(config, (config) => {
    setColor(config.modResults, 'splashscreen_background', '#ffffff');
    setColor(config.modResults, 'iconBackground', '#ffffff');
    setColor(config.modResults, 'colorPrimaryDark', '#ffffff');
    return config;
  });

  config = withAndroidColorsNight(config, (config) => {
    setColor(config.modResults, 'splashscreen_background', '#000000');
    setColor(config.modResults, 'iconBackground', '#000000');
    return config;
  });

  return withAndroidStyles(config, (config) => {
    setStyleItem(config.modResults, 'AppTheme', 'android:statusBarColor', '#ffffff');
    setStyleItem(config.modResults, 'Theme.App.SplashScreen', 'windowSplashScreenBackground', '@color/splashscreen_background');
    setStyleItem(config.modResults, 'Theme.App.SplashScreen', 'windowSplashScreenAnimatedIcon', '@drawable/splashscreen_logo');
    setStyleItem(config.modResults, 'Theme.App.SplashScreen', 'windowSplashScreenIconBackgroundColor', '@android:color/transparent');
    setStyleItem(config.modResults, 'Theme.App.SplashScreen', 'android:statusBarColor', '@color/splashscreen_background');
    setStyleItem(config.modResults, 'Theme.App.SplashScreen', 'android:navigationBarColor', '@color/splashscreen_background');
    return config;
  });
};
