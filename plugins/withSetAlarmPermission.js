/**
 * Config plugin to add com.android.alarm.permission.SET_ALARM to AndroidManifest
 * so "Add to Clock app" can open the system Clock to set an alarm.
 */
const { withAndroidManifest } = require('@expo/config-plugins');
const { addPermission } = require('@expo/config-plugins/build/android/Permissions');

const SET_ALARM_PERMISSION = 'com.android.alarm.permission.SET_ALARM';

function withSetAlarmPermission(config) {
  return withAndroidManifest(config, (config) => {
    addPermission(config.modResults, SET_ALARM_PERMISSION);
    return config;
  });
}

module.exports = withSetAlarmPermission;
