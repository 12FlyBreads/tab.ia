import { AlphaTabWebPackPlugin } from '@coderline/alphatab-webpack';

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    if (!isServer) {
      // alphaTab creates Web Workers and Audio Worklets for rendering/playback.
      // Keep fonts and the SoundFont in public/alphatab as configured by TabViewer.
      config.plugins.push(new AlphaTabWebPackPlugin({ assetOutputDir: false }));
    }
    return config;
  },
};
export default nextConfig;
