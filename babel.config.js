/**
 * Babel configuration for LifeHub.
 *
 * react-native/babel-preset: standard RN transforms (JSX, class props, etc.)
 * react-native-dotenv: lets us import .env variables via `import { WEATHER_API_KEY } from '@env'`
 *   - moduleName: the virtual module name used in import statements
 *   - path: which .env file to read
 *   - allowUndefined: prevents crashes if a variable is missing in .env
 */
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        safe: false,
        allowUndefined: true,
      },
    ],
  ],
};
