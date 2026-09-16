/**
 * Type declarations for modules that don't have @types packages.
 * This file is automatically picked up by TypeScript.
 */

// @env — virtual module from react-native-dotenv babel plugin
declare module '@env' {
  export const WEATHER_API_KEY: string;
}

// react-native-vector-icons — declare all submodule paths
declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import { Component } from 'react';
  import { ImageStyle, TextStyle, ViewStyle } from 'react-native';

  interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: TextStyle | ViewStyle | ImageStyle;
  }

  export default class Icon extends Component<IconProps> {}
}

declare module 'react-native-vector-icons/MaterialIcons' {
  import { Component } from 'react';
  import { ImageStyle, TextStyle, ViewStyle } from 'react-native';
  interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: TextStyle | ViewStyle | ImageStyle;
  }
  export default class Icon extends Component<IconProps> {}
}

// react-native-linear-gradient — already has types, but re-declare for safety
declare module 'react-native-linear-gradient' {
  import { Component } from 'react';
  import { ViewStyle, StyleProp } from 'react-native';
  export interface LinearGradientProps {
    colors: string[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    locations?: number[];
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
  }
  export default class LinearGradient extends Component<LinearGradientProps> {}
}
