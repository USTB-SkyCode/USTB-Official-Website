import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { BlockParser } from '../core/Parser';
import {
  TemplateDef,
  BlockPattern,
  BlockDef,
  ConcreteModelConfig,
  RawBlockState,
  AbstractModelRef,
  VariantRule,
  MultipartRule,
  ResourceContext
} from '../core/types';
import {
  addFaceTextureUsage,
  classifyLayerFromUsage,
  createTextureUsage,
  type RenderLayer,
  type TextureProperties
} from '../generateProperties/logic/layer';

import { cleanTemplate } from './cleanTemplate';
import { createResourceLoader } from '../core/ResourceLoader';
import { Logger } from '../core/Logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateBlocks(context: ResourceContext) {
  Logger.info(`Start generating block data: ${context.resource.key} (${context.resource.label})`);
  Logger.debug(`Resource pack search order: ${context.packPaths.join(', ')}`);

  const resourceLoader = createResourceLoader(context);
  const parser = new BlockParser(p => p, resourceLoader);

  const templates = new Map<string, TemplateDef>();
  const patterns = new Map<string, BlockPattern>();
  const blocks: Record<string, BlockDef> = {};

  // 收集所有方块名称（去重）
  const allBlockNames = new Set<string>();

  // Load decal blocks list
  const decalBlocksPath = path.resolve(__dirname, '../../data/decal_blocks.json');
  let decalBlocks = new Set<string>();
  if (fs.existsSync(decalBlocksPath)) {
    const list = JSON.parse(fs.readFileSync(decalBlocksPath, 'utf-8'));
    if (Array.isArray(list)) {
      decalBlocks = new Set(list.map((t: string) => t.replace('minecraft:', '')));
    }
  } else {
    // Logger.warn(`Warning: Decal blocks list not found at ${decalBlocksPath}`);
  }

  // Load mixed translucent blocks list
  const mixedBlocksPath = path.resolve(__dirname, '../../data/mixed_blocks.json');
  let mixedBlocks = new Set<string>();
  if (fs.existsSync(mixedBlocksPath)) {
    const list = JSON.parse(fs.readFileSync(mixedBlocksPath, 'utf-8'));
    if (Array.isArray(list)) {
      mixedBlocks = new Set(list.map((t: string) => t.replace('minecraft:', '')));
    }
  } else {
    // Logger.warn(`Warning: Mixed blocks list not found at ${mixedBlocksPath}`);
  }

  // Load random block allowlist
  const randomBlockAllowlistPath = path.resolve(__dirname, '../../data/random_block_allowlist.json');
  let randomBlockAllowlist = new Set<string>();
  if (fs.existsSync(randomBlockAllowlistPath)) {
    const list = JSON.parse(fs.readFileSync(randomBlockAllowlistPath, 'utf-8'));
    if (Array.isArray(list)) {
      randomBlockAllowlist = new Set(list.map((t: string) => t.replace('minecraft:', '')));
    }
  }

  // Load texture properties if available (used for element-level layer classification)
  let textureProps: Record<string, TextureProperties> | null = null;
  if (fs.existsSync(context.texturePropertiesPath)) {
    textureProps = JSON.parse(fs.readFileSync(context.texturePropertiesPath, 'utf-8'));
  } else {
    // Logger.warn(`Warning: Texture properties not found at ${context.texturePropertiesPath}`);
  }

  for (const packRoot of context.packPaths) {
      // 1. 尝试标准资源结构 (pack/assets/minecraft/blockstates)
      let blockstatesDir = path.join(packRoot, 'assets/minecraft/blockstates');
      if (!fs.existsSync(blockstatesDir)) {
        // 2. 尝试扁平化目录 (pack/blockstates) - 兼容某些非标准包或旧结构
        blockstatesDir = path.join(packRoot, 'blockstates');
      }
    if (fs.existsSync(blockstatesDir)) {
      const files = fs.readdirSync(blockstatesDir).filter((f: string) => f.endsWith('.json'));
      files.forEach(f => allBlockNames.add(path.basename(f, '.json')));
    }
  }

  Logger.info(`Identified ${allBlockNames.size} unique block definitions.`);

  // 确保中间产物目录存在
  if (!fs.existsSync(context.intermediateDir)) {
    fs.mkdirSync(context.intermediateDir, { recursive: true });
  }

  const processor = new BlockProcessor(
    parser,
    resourceLoader,
    templates,
    patterns,
    blocks,
    decalBlocks,
    mixedBlocks,
    randomBlockAllowlist,
    textureProps,
  );

  let count = 0;
  const total = allBlockNames.size;
  for (const blockName of allBlockNames) {
    try {
      await processor.process(blockName);
      count++;
      Logger.progress(count, total, `Processing ${blockName}`);
    } catch (e) {
      Logger.error(`Failed to process ${blockName}`, e);
    }
  }

  // 输出文件
  const templatesObj: Record<string, TemplateDef> = {};
  templates.forEach((v, k) => (templatesObj[k] = v));

  const patternsObj: Record<string, BlockPattern> = {};
  patterns.forEach((v, k) => (patternsObj[k] = v));

  // 3. 方块
  fs.writeFileSync(
    context.blocksJsonPath,
    JSON.stringify(blocks, null, 2),
  );

  // Templates & Patterns
  fs.writeFileSync(context.templatesJsonPath, JSON.stringify(templatesObj, null, 2));
  fs.writeFileSync(context.patternsJsonPath, JSON.stringify(patternsObj, null, 2));

  Logger.success(`Generate Blocks Done!`);
  Logger.debug(`Intermediate output directory: ${context.intermediateDir}`);
  Logger.info(`Templates Summary: ${templates.size}`);
  Logger.info(`Patterns Summary: ${patterns.size}`);
  Logger.info(`Blocks Summary: ${Object.keys(blocks).length}`);
}

class BlockProcessor {
    constructor(
        private parser: BlockParser,
        private loader: (path: string) => Promise<any>,
        private templates: Map<string, TemplateDef>,
        private patterns: Map<string, BlockPattern>,
        private blocks: Record<string, BlockDef>,
    private decalBlocks: Set<string> = new Set(),
    private mixedBlocks: Set<string> = new Set(),
    private randomBlockAllowlist: Set<string> = new Set(),
    private textureProps: Record<string, TextureProperties> | null = null
    ) {}

    async process(blockName: string) {
      // resourceLoader 会自动在所有资源包中查找该方块定义
      const bs = (await this.loader(
        `assets/minecraft/blockstates/${blockName}.json`,
      )) as RawBlockState;

      // Check if this block is a decal block
      const isDecalBlock = this.decalBlocks.has(blockName);
      const isMixedBlock = this.mixedBlocks.has(blockName);
      const isAllowedRandom = this.randomBlockAllowlist.has(blockName);

      // 临时存储当前方块引用的唯一模型组合
      // 键：JSON.stringify({template, textures, y})；值：槽位索引
      const uniqueModels = new Map<string, number>();
      const slots: ConcreteModelConfig[] = [];

      const getSlotId = (template: string, textures: Record<string, string>, y?: number): number => {
        const config: ConcreteModelConfig = { template, textures };
        if (y !== undefined && y !== 0) config.y = y;

        const key = JSON.stringify(config);
        if (uniqueModels.has(key)) return uniqueModels.get(key)!;
        const id = slots.length;
        slots.push(config);
        uniqueModels.set(key, id);
        return id;
      };

      let patternObj: BlockPattern | null = null;

      if (bs.variants) {
        const propertyNames = new Set<string>();

        // Pre-scan keys to determine properties order
        for (const key of Object.keys(bs.variants)) {
             if (key) {
               key.split(',').forEach(entry => {
                  const [prop] = entry.split('=');
                  if (prop) propertyNames.add(prop);
               });
             }
        }
        const orderedProperties = Array.from(propertyNames).sort();
        const variantRules: VariantRule[] = [];

        for (const [key, variant] of Object.entries(bs.variants)) {
          // Parse key
          const parsedKey: Record<string, string | number | boolean> = {};
          if (key) {
              key.split(',').forEach(entry => {
                  const [prop, rawValue] = entry.split('=');
                  if (!prop) return;
                  let value: string | number | boolean = rawValue;
                  if (rawValue === 'true') value = true;
                  else if (rawValue === 'false') value = false;
                  else if (!Number.isNaN(Number(rawValue)) && rawValue.trim() !== '') value = Number(rawValue);
                  parsedKey[prop] = value;
              });
          }

          const rawList = Array.isArray(variant) ? variant : [variant];
          const abstractList: AbstractModelRef[] = [];
          const values: Array<string | number | boolean | null> = [];

          orderedProperties.forEach(prop => {
            values.push(parsedKey[prop] ?? null);
          });

          for (const raw of rawList) {
            const templateName = await this.processModelToTemplate(raw.model, isDecalBlock, blockName);
            if (templateName) {
              const textures = await this.getModelTextures(raw.model, templateName);

              let modelY = raw.y;
              let modelX = raw.x;
              let modelUvlock = raw.uvlock;

              if (isAllowedRandom) {
                modelY = undefined;
                modelX = undefined;
                modelUvlock = undefined;
              }

              const slotY = modelY !== undefined ? modelY : 0;
              const slotId = getSlotId(templateName, textures, slotY);

              abstractList.push({
                slot: slotId,
                x: modelX,
                y: modelY,
                z: (raw as { z?: number }).z,
                uvlock: modelUvlock,
                weight: raw.weight
              });
            }
          }
          if (abstractList.length > 0) {
            variantRules.push({ values, apply: abstractList });
          }
        }

        patternObj = {
          type: 'variants',
          properties: orderedProperties,
          rules: variantRules,
        };

      } else if (bs.multipart) {
        const rules: unknown[] = [];
        for (const part of bs.multipart) {
          const rawList = Array.isArray(part.apply) ? part.apply : [part.apply];
          const abstractList: AbstractModelRef[] = [];

          for (const raw of rawList) {
            const templateName = await this.processModelToTemplate(raw.model, isDecalBlock, blockName);
            if (templateName) {
              const textures = await this.getModelTextures(raw.model, templateName);

              let modelY = raw.y;
              let modelX = raw.x;
              let modelUvlock = raw.uvlock;

              if (isAllowedRandom) {
                modelY = undefined;
                modelX = undefined;
                modelUvlock = undefined;
              }

              const slotY = modelY !== undefined ? modelY : 0;
              const slotId = getSlotId(templateName, textures, slotY);

              abstractList.push({
                slot: slotId,
                x: modelX,
                y: modelY,
                z: (raw as { z?: number }).z,
                uvlock: modelUvlock,
                weight: raw.weight
              });
            }
          }
          if (abstractList.length > 0) {
            let when = part.when;
            // 将显式 AND 条件数组合并为单一对象
            if (when && (when as any).AND) {
                const conditions = (when as any).AND as Record<string, string>[];
                const merged: Record<string, string> = {};
                conditions.forEach(c => Object.assign(merged, c));
                when = merged;
            }

            rules.push({
              when: when as MultipartRule['when'],
              apply: abstractList,
            });
          }
        }
        patternObj = { type: 'multipart', rules: rules as MultipartRule[] };
      }

      if (patternObj) {
        // Generate Pattern Hash
        const patternStr = JSON.stringify(patternObj);
        let hash = 0;
        for (let i = 0; i < patternStr.length; i++) {
          const char = patternStr.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash; // Convert to 32bit integer
        }
        const patternId = Math.abs(hash).toString(16);

        if (!this.patterns.has(patternId)) {
          this.patterns.set(patternId, patternObj);
        }

        this.blocks[blockName] = {
          pattern: patternId,
          slots: slots,
        };
      }
    }

    private async processModelToTemplate(modelName: string, isDecalBlock: boolean, blockName: string): Promise<string | null> {
        try {
          const templateInfo = await this.parser.findTemplate(modelName);
          if (!templateInfo) {
            return null;
          }

          const isNoteBlock = blockName === 'note_block';
          const useDecalHeuristic = isDecalBlock && !isNoteBlock;
          const outOfBoundsEpsilon = 0.001;

          let hasDecal = false;
          const decalMask: boolean[] = [];
          const mixedLayers: RenderLayer[] = [];
          const canClassifyMixed = !isDecalBlock && this.mixedBlocks.has(blockName) && !!this.textureProps;
          const modelTextures = canClassifyMixed
            ? await this.parser.resolveModelTextures(modelName)
            : null;

          const elementUsesTextureVar = (el: any, varName: string): boolean => {
            if (!el.faces) return false;
            for (const faceKey in el.faces) {
              const face = el.faces[faceKey];
              if (face && typeof face.texture === 'string' && face.texture === `#${varName}`) {
                return true;
              }
            }
            return false;
          };

          // Step 1: Analyze each element
          if (templateInfo.elements) {
            templateInfo.elements.forEach((el: any, idx: number) => {
              let isDecal = false;
              if (isNoteBlock) {
                 const outOfBounds = el.from.some((v: number) => v < -outOfBoundsEpsilon || v > 16 + outOfBoundsEpsilon)
                   || el.to.some((v: number) => v < -outOfBoundsEpsilon || v > 16 + outOfBoundsEpsilon);
                 if (outOfBounds) {
                    isDecal = true;
                 }
              } else if (useDecalHeuristic) {
                 if (blockName === 'lever' && elementUsesTextureVar(el, 'lever')) {
                   isDecal = true;
                 }

                 const dx = Math.abs(el.to[0] - el.from[0]);
                 const dy = Math.abs(el.to[1] - el.from[1]);
                 const dz = Math.abs(el.to[2] - el.from[2]);

                 // Standard Minecraft resolution is 16 pixels per block. 1 pixel = 1/16 = 0.0625.
                 // Anything thinner than 3.2 pixels (approx 0.2) is likely a decal overlay/plane or small detail.
                 const isFlat = dx <= 0.2 || dy <= 0.2 || dz <= 0.2;

                 // Logic: If it's a flat plane AND the block is a designated decal type, mark this specific element as decal.
                 if (isFlat) {
                    isDecal = true;
                  }
              }
              decalMask.push(isDecal);
              if (isDecal) hasDecal = true;

              if (canClassifyMixed && this.textureProps) {
                const usage = createTextureUsage();
                if (el.faces) {
                  for (const face of Object.values(el.faces)) {
                    if (!face || !(face as any).texture) continue;
                    addFaceTextureUsage(usage, face as any, modelTextures ?? undefined);
                  }
                }
                mixedLayers[idx] = classifyLayerFromUsage(usage, this.textureProps);
              }
            });
          }

          let finalTemplateName = templateInfo.name;
          let elementsToUse = templateInfo.elements || [];

          // Force layer splitting if it is a designated decal block, even if no decal elements detected (forced to solid)
          // OR if we detected decal elements dynamically.
          // This ensures elements get explicit render_layer assignment (Layer 0 or 4), avoiding fallback to Layer 1 (Cutout)
           if (hasDecal || useDecalHeuristic) {
             // Keep original template name; layer overrides are acceptable for shared templates.

             // Create a new array of elements with render_layer injected
             elementsToUse = elementsToUse.map((el: any, idx: number) => {
               const newEl = { ...el };
               if (decalMask[idx]) {
                 newEl.render_layer = 'decal';
               } else {
                 // Explicitly mark non-decal parts as solid.
                 // This effectively overrides global 'cutout' setting for the base parts of the model.
                 newEl.render_layer = 'solid';
               }
               return newEl;
             });
          } else if (canClassifyMixed) {
            // Mixed blocks get a dedicated template to avoid sharing element layers across blocks.
            const safeBlock = blockName.replace(/[:/]/g, '_');
            finalTemplateName = `${templateInfo.name}__mixed__${safeBlock}`;
            elementsToUse = elementsToUse.map((el: any, idx: number) => {
              const newEl = { ...el };
              const layer = mixedLayers[idx] ?? 'solid';
              newEl.render_layer = layer;
              return newEl;
            });
          }

          if (!this.templates.has(finalTemplateName)) {
            const vars = new Set<string>();
            const extractVars = (obj: unknown) => {
              if (!obj) return;
              if (typeof obj === 'string' && obj.startsWith('#')) {
                vars.add(obj.substring(1));
              } else if (typeof obj === 'object') {
                for (const k in obj) extractVars((obj as Record<string, unknown>)[k]);
              }
            };
            elementsToUse.forEach((el: any) => {
              for (const face in el.faces) {
                extractVars(el.faces[face].texture);
              }
            });
            this.templates.set(finalTemplateName, cleanTemplate({
              elements: elementsToUse,
              texture_vars: Array.from(vars),
            }));
          }
          return finalTemplateName;
        } catch (e) {
          console.warn(`Error processing model ${modelName}:`, e);
          return null;
        }
      }

      private async getModelTextures(
        modelName: string,
        templateName: string,
      ): Promise<Record<string, string>> {
        const allTextures = await this.parser.resolveModelTextures(modelName);
        const templateDef = this.templates.get(templateName)!;
        const filtered: Record<string, string> = {};
        templateDef.texture_vars.forEach(v => {
          if (allTextures[v]) filtered[v] = allTextures[v];
        });
        return filtered;
      }
}
