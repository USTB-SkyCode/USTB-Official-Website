import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ResourceContext } from '../core/types';
import { determineBlockLayer } from './logic/layer';
import { calculateBlockEmission } from './logic/emission';
import { Logger } from '../core/Logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateBlockProperties(context: ResourceContext): Promise<void> {
  Logger.info(`Generate Block Properties: ${context.resource.key} (${context.resource.label})`);

  if (!fs.existsSync(context.blocksJsonPath)) {
    Logger.error(`Error: Block Data not found ${context.blocksJsonPath}`);
    return;
  }
  if (!fs.existsSync(context.texturePropertiesPath)) {
    Logger.error(`Error: Texture Properties not found ${context.texturePropertiesPath}`);
    return;
  }

  const blocks = JSON.parse(fs.readFileSync(context.blocksJsonPath, 'utf-8'));
  const textureProps = JSON.parse(fs.readFileSync(context.texturePropertiesPath, 'utf-8'));
  const templates = JSON.parse(fs.readFileSync(context.templatesJsonPath, 'utf-8'));

  // Load decal list
  const decalListPath = path.resolve(__dirname, '../../data/decal_blocks.json');
  let decalBlocks = new Set<string>();
  if (fs.existsSync(decalListPath)) {
    const list = JSON.parse(fs.readFileSync(decalListPath, 'utf-8'));
    if (Array.isArray(list)) {
      decalBlocks = new Set(list);
    }
  } else {
    // Logger.warn(`Warning: Decal list not found at ${decalListPath}`);
  }

  // Load mixed blocks list
  const mixedListPath = path.resolve(__dirname, '../../data/mixed_blocks.json');
  let mixedBlocks = new Set<string>();
  let mixedBlocksNormalized = new Set<string>();
  if (fs.existsSync(mixedListPath)) {
    const list = JSON.parse(fs.readFileSync(mixedListPath, 'utf-8'));
    if (Array.isArray(list)) {
      mixedBlocks = new Set(list);
      mixedBlocksNormalized = new Set(list.map((t: string) => t.replace(/^minecraft:/, '')));
    }
  } else {
    // Logger.warn(`Warning: Mixed blocks list not found at ${mixedListPath}`);
  }

  const blockProperties: Record<string, {
    render_layer: 'solid' | 'cutout' | 'cutout_mipped' | 'translucent',
    is_decal: boolean,
    emission?: { color: [number, number, number], intensity: number, radius: number, is_lab_pbr: boolean },
    slot_emissions?: Array<{ color: [number, number, number], intensity: number, radius: number, is_lab_pbr: boolean } | undefined>,
    state_dependent_light?: boolean
  }> = {};

  let count = 0;
  const total = Object.keys(blocks).length;

  for (const blockName of Object.keys(blocks)) {
    count++;
    Logger.progress(count, total, `Analyzing ${blockName}`);

    const def = blocks[blockName] as any;
    // Corrected cleanName logic to just strip minecraft: for simpleKey matching
    let cleanName = blockName;
    if (cleanName.startsWith('minecraft:')) cleanName = cleanName.substring(10);

    // 1. Determine Render Layer
    let layer = determineBlockLayer(blockName, cleanName, def, textureProps, templates);

    // 2. Calculate Emission
    const { emission, slot_emissions, state_dependent_light } = calculateBlockEmission(blockName, cleanName, def);

    // 3. Determine Decal Flag
    const isDecal = decalBlocks.has(blockName) || decalBlocks.has(`minecraft:${cleanName}`);

    // 4. Mixed blocks should keep block-level layer solid to avoid greedy/cutout routing.
    const isMixed = mixedBlocks.has(blockName)
      || mixedBlocks.has(`minecraft:${cleanName}`)
      || mixedBlocksNormalized.has(cleanName);
    if (isMixed && layer !== 'translucent') {
      layer = 'solid';
    }

    blockProperties[blockName] = {
      render_layer: layer,
      is_decal: isDecal,
      emission: emission || undefined,
      slot_emissions: slot_emissions.some(e => e !== null) ? slot_emissions.map(e => e || undefined) : undefined,
      state_dependent_light: state_dependent_light || undefined
    };
  }

  fs.writeFileSync(context.blockPropertiesPath, JSON.stringify(blockProperties, null, 2));
  Logger.success(`Generated ${count} Block Property Records.`);
  Logger.debug(`Output Path: ${context.blockPropertiesPath}`);
}
