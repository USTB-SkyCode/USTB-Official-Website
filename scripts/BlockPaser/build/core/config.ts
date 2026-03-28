import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ResourceContext, ResourceDefinition } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------
// 通用路径信息
// ------------------------------------------

export const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

export const OFFLINE_CONFIGS: Record<string, {
  PACKS: string[];
  BASE_PATH: string;
  FILES?: {
      BLOCKS: string;
      TEMPLATES: string;
      PATTERNS: string;
      CULLING_MASKS: string;
      BLOCK_PROPERTIES: string;
  }
}> = {
  'minecraft16': {
      PACKS: ['resource/resourcepack/minecraft'],
      BASE_PATH: '/model',
  },
  'hybrid128': {
      PACKS: [
          'resource/resourcepack/05cube',
          'resource/resourcepack/05redstone',
          'resource/resourcepack/05glasspane',
          'resource/resourcepack/05pbr128',
          'resource/resourcepack/minecraft',
      ],
      BASE_PATH: '/basic',
  },
};

const DEFAULT_MODEL_FILES = {
  BLOCKS: 'blocks.json',
  TEMPLATES: 'templates.json',
  PATTERNS: 'patterns.json',
  CULLING_MASKS: 'cullingMasks.json',
  BLOCK_PROPERTIES: 'block_properties.json',
} as const;

const SCRIPT_RESOURCE_PRESETS: ResourceDefinition[] = [
  {
    key: 'minecraft16',
    label: 'Minecraft Default (16px)',
    MAX_TEXTURE_SIZE: 16,
    MODELS: '/model',
    LABPBR: false,
  },
  {
    key: 'hybrid128',
    label: 'Hybrid PBR (128px)',
    MAX_TEXTURE_SIZE: 128,
    MODELS: '/basic',
    LABPBR: true,
  },
];

function resolvePackRoots(resource: ResourceDefinition): string[] {
  const offline = OFFLINE_CONFIGS[resource.key];
  if (!offline) {
      throw new Error(`Offline config for resource key "${resource.key}" not found.`);
  }
  return offline.PACKS.map(packPath => path.resolve(PROJECT_ROOT, packPath));
}

function resolveBasePaths(resource: ResourceDefinition): { relative: string; absolute: string } {
  const basePath = resource.MODELS;
  const relative = basePath.startsWith('/') ? basePath.slice(1) : basePath;
  const absolute = path.resolve(PROJECT_ROOT, 'public', relative);
  return { relative, absolute };
}

export function buildResourceContext(resource: ResourceDefinition): ResourceContext {
  const packPaths = resolvePackRoots(resource);
  const { relative, absolute } = resolveBasePaths(resource);
  // Intermediate directory now uses the relative base path (e.g., 'basic' or 'model')
  const intermediateDir = path.resolve(PROJECT_ROOT, 'resource', 'intermediate', relative);
  const intermediateBinDir = path.resolve(intermediateDir, 'bin');
  const compiledTextureDir = path.resolve(absolute, 'compiled');
  const assestDir = path.resolve(absolute, 'assest');
  const offline = OFFLINE_CONFIGS[resource.key];
  const files = offline?.FILES ?? DEFAULT_MODEL_FILES;

  return {
    resource,
    packPaths,
    relativeBasePath: relative,
    outputModelDir: absolute,
    assestDir,
    intermediateDir,
    intermediateBinDir,
    compiledTextureDir,
    templatesJsonPath: path.resolve(intermediateDir, files.TEMPLATES),
    patternsJsonPath: path.resolve(intermediateDir, files.PATTERNS),
    blocksJsonPath: path.resolve(intermediateDir, files.BLOCKS),
    cullingMasksJsonPath: path.resolve(intermediateDir, files.CULLING_MASKS),
    texturePropertiesPath: path.resolve(intermediateDir, 'texture_properties.json'),
    blockPropertiesPath: path.resolve(intermediateDir, files.BLOCK_PROPERTIES),
    textureManifestPath: path.resolve(intermediateDir, 'textures.manifest.json'),
  };
}

export function getResourceContexts(): ResourceContext[] {
  return SCRIPT_RESOURCE_PRESETS.map(resource => buildResourceContext(resource));
}
