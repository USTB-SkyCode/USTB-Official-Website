import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ResourceContext, ResourceDefinition } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------
// 通用路径信息
// ------------------------------------------

export const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const RESOURCE_PACK_ROOT = path.resolve(PROJECT_ROOT, 'resource', 'resourcepack');
const PUBLIC_PACKS_ROOT = path.resolve(PROJECT_ROOT, 'public', 'packs');
const FRONTEND_GENERATED_CATALOG_PATH = path.resolve(
  PROJECT_ROOT,
  'src',
  'generated',
  'resourcePackCatalog.ts',
);
const PUBLIC_PACK_INDEX_PATH = path.resolve(PUBLIC_PACKS_ROOT, 'index.json');
const PACK_DEFINITION_SUFFIX = '.pack.json';

type RawResourceDefinition = {
  key?: unknown;
  label?: unknown;
  description?: unknown;
  order?: unknown;
  directory?: unknown;
  maxTextureSize?: unknown;
  labPbr?: unknown;
  default?: unknown;
  packs?: unknown;
  files?: {
    BLOCKS?: unknown;
    TEMPLATES?: unknown;
    PATTERNS?: unknown;
    CULLING_MASKS?: unknown;
    BLOCK_PROPERTIES?: unknown;
  };
};

type CatalogEntry = {
  resource: ResourceDefinition;
  order: number;
  isDefault: boolean;
  files?: {
    BLOCKS: string;
    TEMPLATES: string;
    PATTERNS: string;
    CULLING_MASKS: string;
    BLOCK_PROPERTIES: string;
  };
};

type GeneratedCatalogEntry = {
  key: string;
  label: string;
  description: string;
  order: number;
  directory: string;
  default: boolean;
  maxTextureSize: number;
  labPbr: boolean;
  packRoot: string;
  sourcePacks: string[];
};

type ResourceCatalog = {
  entries: CatalogEntry[];
  defaultKey: string;
};

let cachedCatalog: ResourceCatalog | null = null;

const DEFAULT_MODEL_FILES = {
  BLOCKS: 'blocks.json',
  TEMPLATES: 'templates.json',
  PATTERNS: 'patterns.json',
  CULLING_MASKS: 'cullingMasks.json',
  BLOCK_PROPERTIES: 'block_properties.json',
} as const;

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function normalizeRelativePath(raw: unknown, fieldName: string, sourceName: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`${sourceName}: ${fieldName} must be a string.`);
  }

  const normalized = raw.trim().replace(/\\+/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized.length) {
    throw new Error(`${sourceName}: ${fieldName} must not be empty.`);
  }

  const segments = normalized.split('/');
  if (segments.some(segment => !segment.length || segment === '.' || segment === '..')) {
    throw new Error(`${sourceName}: ${fieldName} contains an invalid path segment.`);
  }

  return segments.join('/');
}

function normalizePositiveInteger(raw: unknown, fieldName: string, sourceName: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
    throw new Error(`${sourceName}: ${fieldName} must be a positive integer.`);
  }
  return raw;
}

function normalizeNonNegativeInteger(
  raw: unknown,
  fieldName: string,
  sourceName: string,
  fallback: number,
): number {
  if (raw === undefined) {
    return fallback;
  }

  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    throw new Error(`${sourceName}: ${fieldName} must be a non-negative integer.`);
  }

  return raw;
}

function normalizeSourcePacks(raw: unknown, sourceName: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${sourceName}: packs must be a non-empty array.`);
  }

  return raw.map((entry, index) =>
    normalizeRelativePath(entry, `packs[${index}]`, sourceName),
  );
}

function buildPublicBasePath(directory: string): string {
  return `/${path.posix.join('packs', directory)}`;
}

function joinUrl(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}

function loadResourceCatalog(): ResourceCatalog {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  const definitionFiles = fs
    .readdirSync(RESOURCE_PACK_ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(PACK_DEFINITION_SUFFIX))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (!definitionFiles.length) {
    throw new Error(`No resource pack definitions found in ${RESOURCE_PACK_ROOT}.`);
  }

  const entries = definitionFiles.map(fileName => {
    const filePath = path.resolve(RESOURCE_PACK_ROOT, fileName);
    const sourceName = `resourcepack definition ${fileName}`;
    const raw = readJsonFile<RawResourceDefinition>(filePath);

    if (typeof raw.key !== 'string' || !raw.key.trim().length) {
      throw new Error(`${sourceName}: key must be a non-empty string.`);
    }
    if (typeof raw.label !== 'string' || !raw.label.trim().length) {
      throw new Error(`${sourceName}: label must be a non-empty string.`);
    }
    if (typeof raw.labPbr !== 'boolean') {
      throw new Error(`${sourceName}: labPbr must be a boolean.`);
    }

    const key = raw.key.trim();
    const label = raw.label.trim();
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    const order = normalizeNonNegativeInteger(raw.order, 'order', sourceName, Number.MAX_SAFE_INTEGER);
    const directory = normalizeRelativePath(raw.directory ?? key, 'directory', sourceName);
    const maxTextureSize = normalizePositiveInteger(
      raw.maxTextureSize,
      'maxTextureSize',
      sourceName,
    );
    const sourcePacks = normalizeSourcePacks(raw.packs, sourceName);
    const publicBasePath = buildPublicBasePath(directory);

    for (const packKey of sourcePacks) {
      const packDir = path.resolve(RESOURCE_PACK_ROOT, ...packKey.split('/'));
      if (!fs.existsSync(packDir) || !fs.statSync(packDir).isDirectory()) {
        throw new Error(`${sourceName}: source pack '${packKey}' does not exist.`);
      }
    }

    const rawFiles = raw.files;
    const files = rawFiles
      ? {
          BLOCKS: typeof rawFiles.BLOCKS === 'string' ? rawFiles.BLOCKS : DEFAULT_MODEL_FILES.BLOCKS,
          TEMPLATES:
            typeof rawFiles.TEMPLATES === 'string'
              ? rawFiles.TEMPLATES
              : DEFAULT_MODEL_FILES.TEMPLATES,
          PATTERNS:
            typeof rawFiles.PATTERNS === 'string'
              ? rawFiles.PATTERNS
              : DEFAULT_MODEL_FILES.PATTERNS,
          CULLING_MASKS:
            typeof rawFiles.CULLING_MASKS === 'string'
              ? rawFiles.CULLING_MASKS
              : DEFAULT_MODEL_FILES.CULLING_MASKS,
          BLOCK_PROPERTIES:
            typeof rawFiles.BLOCK_PROPERTIES === 'string'
              ? rawFiles.BLOCK_PROPERTIES
              : DEFAULT_MODEL_FILES.BLOCK_PROPERTIES,
        }
      : undefined;

    return {
      resource: {
        key,
        label,
        description: description || undefined,
        DIRECTORY: directory,
        MAX_TEXTURE_SIZE: maxTextureSize,
        MODELS: publicBasePath,
        LABPBR: raw.labPbr,
        SOURCE_PACKS: sourcePacks,
      },
      order,
      isDefault: raw.default === true,
      files,
    } satisfies CatalogEntry;
  });

  entries.sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.resource.key.localeCompare(right.resource.key);
  });

  const seenKeys = new Set<string>();
  const seenDirectories = new Set<string>();

  for (const entry of entries) {
    if (seenKeys.has(entry.resource.key)) {
      throw new Error(`Duplicate resource key '${entry.resource.key}' found in resource pack catalog.`);
    }
    if (seenDirectories.has(entry.resource.DIRECTORY)) {
      throw new Error(
        `Duplicate resource directory '${entry.resource.DIRECTORY}' found in resource pack catalog.`,
      );
    }

    seenKeys.add(entry.resource.key);
    seenDirectories.add(entry.resource.DIRECTORY);
  }

  const defaults = entries.filter(entry => entry.isDefault);
  if (defaults.length > 1) {
    throw new Error('Only one resource pack definition can set default=true.');
  }

  cachedCatalog = {
    entries,
    defaultKey: (defaults[0] ?? entries[0]).resource.key,
  };
  return cachedCatalog;
}

function resolvePackRoots(resource: ResourceDefinition): string[] {
  return resource.SOURCE_PACKS.map(packKey =>
    path.resolve(RESOURCE_PACK_ROOT, ...packKey.split('/')),
  );
}

function resolveBasePaths(resource: ResourceDefinition): {
  relative: string;
  absolute: string;
  publicBasePath: string;
} {
  const relative = path.posix.join('packs', resource.DIRECTORY);
  const absolute = path.resolve(PROJECT_ROOT, 'public', ...relative.split('/'));
  return {
    relative,
    absolute,
    publicBasePath: buildPublicBasePath(resource.DIRECTORY),
  };
}

function buildGeneratedCatalogEntry(entry: CatalogEntry, defaultKey: string): GeneratedCatalogEntry {
  const { resource } = entry;
  const packRoot = buildPublicBasePath(resource.DIRECTORY);
  return {
    key: resource.key,
    label: resource.label,
    description: resource.description ?? '',
    order: entry.order,
    directory: resource.DIRECTORY,
    default: resource.key === defaultKey,
    maxTextureSize: resource.MAX_TEXTURE_SIZE,
    labPbr: resource.LABPBR,
    packRoot,
    sourcePacks: [...resource.SOURCE_PACKS],
  };
}

function writeFrontendGeneratedCatalog(entries: GeneratedCatalogEntry[], defaultKey: string) {
  const fileContents = [
    '/* Auto-generated by scripts/BlockPaser/build/core/config.ts. Do not edit manually. */',
    `export const DEFAULT_RESOURCE_PACK_KEY = ${JSON.stringify(defaultKey)} as const;`,
    '',
    `export const RESOURCE_PACK_CATALOG = ${JSON.stringify(entries, null, 2)} as const;`,
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(FRONTEND_GENERATED_CATALOG_PATH), { recursive: true });
  fs.writeFileSync(FRONTEND_GENERATED_CATALOG_PATH, fileContents, 'utf-8');
}

function writePublicPackMetadata(entries: GeneratedCatalogEntry[], defaultKey: string) {
  const generatedAt = new Date().toISOString();
  fs.mkdirSync(PUBLIC_PACKS_ROOT, { recursive: true });

  fs.writeFileSync(
    PUBLIC_PACK_INDEX_PATH,
    `${JSON.stringify({ generatedAt, defaultKey, packs: entries }, null, 2)}\n`,
    'utf-8',
  );

  for (const entry of entries) {
    const targetDir = path.resolve(PUBLIC_PACKS_ROOT, ...entry.directory.split('/'));
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.resolve(targetDir, 'metadata.json'),
      `${JSON.stringify({ generatedAt, ...entry }, null, 2)}\n`,
      'utf-8',
    );
  }
}

export function syncResourcePackArtifacts(): void {
  const catalog = loadResourceCatalog();
  const generatedEntries = catalog.entries.map(entry =>
    buildGeneratedCatalogEntry(entry, catalog.defaultKey),
  );

  writeFrontendGeneratedCatalog(generatedEntries, catalog.defaultKey);
  writePublicPackMetadata(generatedEntries, catalog.defaultKey);
}

export function buildResourceContext(resource: ResourceDefinition): ResourceContext {
  const packPaths = resolvePackRoots(resource);
  const { relative, absolute, publicBasePath } = resolveBasePaths(resource);
  const intermediateDir = path.resolve(PROJECT_ROOT, 'resource', 'intermediate', relative);
  const intermediateBinDir = path.resolve(intermediateDir, 'bin');
  const compiledTextureDir = path.resolve(absolute, 'compiled');
  const assetsDir = path.resolve(absolute, 'assets');
  const metadataJsonPath = path.resolve(absolute, 'metadata.json');
  const catalog = loadResourceCatalog();
  const entry = catalog.entries.find(candidate => candidate.resource.key === resource.key);
  const files = entry?.files ?? DEFAULT_MODEL_FILES;

  return {
    resource,
    packPaths,
    relativeBasePath: relative,
    publicBasePath,
    outputModelDir: absolute,
    assetsDir,
    intermediateDir,
    intermediateBinDir,
    compiledTextureDir,
    metadataJsonPath,
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
  return loadResourceCatalog().entries.map(entry => buildResourceContext(entry.resource));
}
