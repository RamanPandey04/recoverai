import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  transpilePackages: ["@recoverai/domain"],
  webpack: config => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@recoverai/domain": path.resolve(__dirname, "../../apps/api/dist/packages/domain/src/index.js")
    };
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"]
    };
    return config;
  }
};
export default config;
