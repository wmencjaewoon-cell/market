const { withPodfileProperties, withXcodeProject } = require('@expo/config-plugins');

const HERMES_DSYM_PHASE_NAME = 'Create Hermes dSYM';

const HERMES_DSYM_SCRIPT = `set -e

if [ "$CONFIGURATION" != "Release" ]; then
  exit 0
fi

HERMES_BINARY="$PODS_XCFRAMEWORKS_BUILD_DIR/hermes-engine/Pre-built/hermes.framework/hermes"
if [ ! -f "$HERMES_BINARY" ]; then
  HERMES_BINARY="$PODS_ROOT/hermes-engine/destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64/hermes.framework/hermes"
fi

if [ ! -f "$HERMES_BINARY" ]; then
  echo "warning: Hermes binary not found, skipping Hermes dSYM generation"
  exit 0
fi

DSYM_OUTPUT="$DWARF_DSYM_FOLDER_PATH/hermes.framework.dSYM"
mkdir -p "$DWARF_DSYM_FOLDER_PATH"
rm -rf "$DSYM_OUTPUT"
xcrun dsymutil "$HERMES_BINARY" -o "$DSYM_OUTPUT" > /dev/null 2>&1 || true

if [ -d "$DSYM_OUTPUT" ]; then
  echo "Generated Hermes dSYM at $DSYM_OUTPUT"
fi
`;

function upsertHermesDsymBuildPhase(project) {
  const targetUuid = project.getFirstTarget().uuid;
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};

  for (const [key, phase] of Object.entries(phases)) {
    if (key.endsWith('_comment')) {
      continue;
    }

    const name = String(phase.name || '').replace(/^"|"$/g, '');
    if (name === HERMES_DSYM_PHASE_NAME) {
      phase.shellPath = '/bin/sh';
      phase.shellScript = JSON.stringify(HERMES_DSYM_SCRIPT);
      phase.inputPaths = [];
      phase.outputPaths = [];
      return;
    }
  }

  project.addBuildPhase([], 'PBXShellScriptBuildPhase', HERMES_DSYM_PHASE_NAME, targetUuid, {
    shellPath: '/bin/sh',
    shellScript: HERMES_DSYM_SCRIPT,
    inputPaths: [],
    outputPaths: [],
  });
}

module.exports = function withReactNativeSourceBuild(config) {
  config = withPodfileProperties(config, (config) => {
    config.modResults['ios.buildReactNativeFromSource'] = 'true';
    return config;
  });

  return withXcodeProject(config, (config) => {
    upsertHermesDsymBuildPhase(config.modResults);
    return config;
  });
};
