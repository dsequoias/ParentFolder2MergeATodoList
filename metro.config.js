// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure web uses database.web.js (API + localStorage) so delete/update hit TodoDB.db
config.resolver = config.resolver || {};
config.resolver.platforms = ['ios', 'android', 'web', 'native'];

module.exports = config;
