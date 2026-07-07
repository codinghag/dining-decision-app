// Reanimated 4 relies on react-native-worklets; its Babel plugin rewrites
// worklet functions (used by the Decide Now swipe gesture) and MUST be listed
// last. Added in Phase 2 — Phase 1 had no reanimated dependency, so no config
// was needed then.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
