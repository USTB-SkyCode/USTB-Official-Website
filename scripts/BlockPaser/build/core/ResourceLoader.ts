import * as fs from 'fs';
import * as path from 'path';
import type { ResourceContext } from './types';

export type ResourceLoaderFunction = (resourcePath: string) => Promise<unknown>;

export function createResourceLoader(context: ResourceContext): ResourceLoaderFunction {
  return async (resourcePath: string): Promise<unknown> => {
    // 处理路径前缀，使其相对于资源包根目录
    // 例如：/assets/minecraft/blockstates/dirt.json -> assets/minecraft/blockstates/dirt.json
    const assetPath = resourcePath.startsWith('/') ? resourcePath.substring(1) : resourcePath;
    
    // 提取相对于 minecraft 根目录的路径 (如 blockstates/dirt.json)
    const relativePath = resourcePath.replace(/^(\/)?(assets|resource)\/minecraft\//, '');

    for (const packRoot of context.packPaths) {
      // 1. 尝试标准路径 (packRoot/assets/minecraft/...)
      const standardPath = path.join(packRoot, assetPath);
      if (fs.existsSync(standardPath)) {
        return JSON.parse(fs.readFileSync(standardPath, 'utf-8'));
      }

      // 2. 尝试扁平化路径 (packRoot/blockstates/...)
      const flatPath = path.join(packRoot, relativePath);
      if (fs.existsSync(flatPath)) {
        return JSON.parse(fs.readFileSync(flatPath, 'utf-8'));
      }

      // 3. 兼容旧版路径 (packRoot/minecraft/...)
      const legacyPath = path.join(packRoot, resourcePath.replace(/^\/(assets|resource)\//, ''));
      if (fs.existsSync(legacyPath)) {
        return JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
      }
    }

    throw new Error(`Resource not found in any pack: ${resourcePath}`);
  };
}
