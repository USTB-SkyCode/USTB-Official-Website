import * as fs from 'fs';
import * as path from 'path';
import pako from 'pako';
import { Logger } from '../core/Logger';
import { serializeRegistry } from './RegistrySerializer';
import type { ResourceContext } from '../core/types';

/**
 * 二次优化脚本 - 核心目标:
 * 1. 材质改革: 贴图名 -> 全局ID映射。
 * 2. 结构重组: 冗余属性合并 & 键名简化。
 * 3. 二进制友好: 位掩码压缩 & 索引访问。
 */

interface RawBlockDef {
  pattern: string;
  slots: {
    template: string;
    textures: Record<string, string | null>;
  }[];
  use_variant_lut?: boolean;
}

interface RawTemplateDef {
  elements: any[];
  texture_vars: string[] | Record<string, string | null>;
}

interface BlockProperties {
  render_layer: string;
  is_decal?: boolean;
  emission?: {
    color: [number, number, number];
    intensity: number;
    radius: number;
    is_lab_pbr: boolean;
  };
  slot_emissions?: Array<{
    color: [number, number, number];
    intensity: number;
    radius: number;
    is_lab_pbr: boolean;
  } | undefined>;
  state_dependent_light?: boolean;
}

const LAYER_MAP: Record<string, number> = {
  'solid': 0,
  'cutout': 1,
  'cutout_mipped': 2,
  'translucent': 3,
  'decal': 4
};

const DIR_MAP: Record<string, number> = {
  'up': 0,
  'down': 1,
  'north': 2,
  'south': 3,
  'west': 4,
  'east': 5
};

const AXIS_MAP: Record<string, number> = {
  'x': 0,
  'y': 1,
  'z': 2
};

// --- 位掩码光栅化逻辑 ---

/**
 * Rasterize a face into an N x N grid.
 * For 8x8: returns a single u64 BigInt mask.
 * For 16x16: returns 4 u64 BigInt masks (2x2 tiles of 8x8).
 */
function rasterizeFace(elements: any[], faceType: number, grid: 8): { mask8: bigint };
function rasterizeFace(elements: any[], faceType: number, grid: 16): { mask16: [bigint, bigint, bigint, bigint] };
function rasterizeFace(elements: any[], faceType: number, grid: 8 | 16) {
  const tileMasks = grid === 16 ? [0n, 0n, 0n, 0n] : null;
  let mask8 = 0n;

  // faceType: 0=Up(Y=16), 1=Down(Y=0), 2=North(Z=0), 3=South(Z=16), 4=West(X=0), 5=East(X=16)
  const E = 0.01;
  const cell = 16 / grid; // 2 for 8x8, 1 for 16x16

  const setBit16 = (row: number, col: number) => {
    if (!tileMasks) return;
    const tile = ((row >> 3) * 2) + (col >> 3); // 0..3
    const r = row & 7;
    const c = col & 7;
    tileMasks[tile] |= 1n << BigInt(r * 8 + c);
  };

  for (const el of elements) {
    const from = el.from; // [x, y, z]
    const to = el.to;

    let valid = false;
    let minU = 0, minV = 0, maxU = 0, maxV = 0;

    switch (faceType) {
      case 0:
        if (Math.abs(to[1] - 16) < E) {
          valid = true;
          minU = from[0]; maxU = to[0];
          minV = from[2]; maxV = to[2];
        }
        break;
      case 1:
        if (Math.abs(from[1] - 0) < E) {
          valid = true;
          minU = from[0]; maxU = to[0];
          minV = from[2]; maxV = to[2];
        }
        break;
      case 2:
        if (Math.abs(from[2] - 0) < E) {
          valid = true;
          minU = from[0]; maxU = to[0];
          minV = from[1]; maxV = to[1];
        }
        break;
      case 3:
        if (Math.abs(to[2] - 16) < E) {
          valid = true;
          minU = from[0]; maxU = to[0];
          minV = from[1]; maxV = to[1];
        }
        break;
      case 4:
        if (Math.abs(from[0] - 0) < E) {
          valid = true;
          minU = from[2]; maxU = to[2];
          minV = from[1]; maxV = to[1];
        }
        break;
      case 5:
        if (Math.abs(to[0] - 16) < E) {
          valid = true;
          minU = from[2]; maxU = to[2];
          minV = from[1]; maxV = to[1];
        }
        break;
    }

    if (valid) {
      for (let r = 0; r < grid; r++) {
        const cellMinV = r * cell;
        const cellMaxV = r * cell + cell;
        if (maxV <= cellMinV || minV >= cellMaxV) continue;

        for (let c = 0; c < grid; c++) {
          const cellMinU = c * cell;
          const cellMaxU = c * cell + cell;
          if (maxU <= cellMinU || minU >= cellMaxU) continue;

          if (grid === 8) {
            mask8 |= 1n << BigInt(r * 8 + c);
          } else {
            setBit16(r, c);
          }
        }
      }
    }
  }

  if (grid === 8) {
    return { mask8 };
  }
  return { mask16: tileMasks as [bigint, bigint, bigint, bigint] };
}

function countBits(mask: bigint): number {
  let m = mask;
  let count = 0;
  while (m > 0n) {
    count += Number(m & 1n);
    m >>= 1n;
  }
  return count;
}

function calculateTemplateMasks(elements: any[]) {
  const masks8: string[] = [];
  const masks16: string[] = [];
  let maskRes = 0;

  for (let face = 0; face < 6; face++) {
    const { mask8 } = rasterizeFace(elements, face, 8);
    const { mask16 } = rasterizeFace(elements, face, 16) as { mask16: [bigint, bigint, bigint, bigint] };

    const area8 = countBits(mask8) * 4; // upsampled to 16x16 area
    const area16 = mask16.reduce((acc, m) => acc + countBits(m), 0);

    masks8.push("0x" + mask8.toString(16));

    if (area8 > area16) {
      maskRes |= (1 << face);
      for (const tile of mask16) {
        masks16.push("0x" + tile.toString(16));
      }
    } else {
      // Placeholder tiles for non-16x16 faces to keep indices stable
      masks16.push("0x0", "0x0", "0x0", "0x0");
    }
  }

  return { masks8, masks16: maskRes ? masks16 : undefined, maskRes };
}

function hashTemplate(temp: any): string {
  return JSON.stringify(temp);
}



export async function optimizeContext(context: ResourceContext) {
  const inputDir = context.intermediateDir;
  const outputDir = path.join(inputDir, 'optimized');

  Logger.info(`[Optimizer] Processing ${context.resource.key}...`);

  if (!fs.existsSync(context.blocksJsonPath)) {
     Logger.warn(`[Optimizer] Skip ${context.resource.key}: blocks.json not found at ${context.blocksJsonPath}`);
     return;
  }

  const blocksJson: Record<string, RawBlockDef> = JSON.parse(fs.readFileSync(context.blocksJsonPath, 'utf-8'));
  const patternsJson: any = JSON.parse(fs.readFileSync(context.patternsJsonPath, 'utf-8'));
  const templatesJson: Record<string, RawTemplateDef> = JSON.parse(fs.readFileSync(context.templatesJsonPath, 'utf-8'));
  const propertiesJson: Record<string, BlockProperties> = JSON.parse(fs.readFileSync(context.blockPropertiesPath, 'utf-8'));



  // 从纹理清单生成映射表
  const manifestPath = context.textureManifestPath;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const textureMap: Record<string, number> = {};
  manifest.textures.forEach((t: any, index: number) => {
    textureMap[t.name] = index;
  });

  const normalizeTex = (name: string) => {
    if (!name) return name;
    // minecraft:block/dirt -> dirt
    return name.split(':').pop()!.split('/').pop()!;
  };

  // 1. 优化 Templates (包含去重 & 默认值裁剪)
  const templatePool: Record<string, string> = {}; // hash -> id
  const idToTemplate: Record<string, any> = {};
  const nameToId: Record<string, string> = {}; // 原文件名 -> 新ID
  let nextTemplateId = 0;

  const templateEntries = Object.entries(templatesJson);
  const totalTemplates = templateEntries.length;
  let processedTemplates = 0;

  for (const [name, temp] of templateEntries) {
    processedTemplates++;
    if (processedTemplates % 100 === 0) Logger.progress(processedTemplates, totalTemplates, `Optimizing Templates`);
    const vars = Array.isArray(temp.texture_vars) ? temp.texture_vars : Object.keys(temp.texture_vars || {});
    const maskPack = calculateTemplateMasks(temp.elements);

    const optimizedTemp = {
      v: vars,
      e: temp.elements.map(el => {
        const faces = new Array(6).fill(null);
        for (const [dir, face] of Object.entries(el.faces as Record<string, any>)) {
          const dirIdx = DIR_MAP[dir];
          if (dirIdx !== undefined) {
            let texIdx = -1;
            if (typeof face.texture === 'string') {
              if (face.texture.startsWith('#')) {
                texIdx = vars.indexOf(face.texture.substring(1));
              } else {
                const globalId = textureMap[normalizeTex(face.texture)];
                if (globalId !== undefined) {
                  texIdx = -(globalId + 1);
                }
              }
            }

            const f: any = { t: texIdx };

            // UV 极致压缩:
            // 默认 [0,0,16,16] 不存储，
            // 否则将 4 个 float 压缩成一个 u32 (每个分量 * 10 存入 8bit)
            if (face.uv && !(face.uv[0] === 0 && face.uv[1] === 0 && face.uv[2] === 16 && face.uv[3] === 16)) {
              const u1 = Math.round(face.uv[0] * 10) & 0xFF;
              const v1 = Math.round(face.uv[1] * 10) & 0xFF;
              const u2 = Math.round(face.uv[2] * 10) & 0xFF;
              const v2 = Math.round(face.uv[3] * 10) & 0xFF;
              f.u = ((u1 << 24) | (v1 << 16) | (u2 << 8) | v2) >>> 0;
            }

            if (face.cullface) f.c = DIR_MAP[face.cullface];
            if (face.rotation) f.r = face.rotation;
            if (face.tintindex !== undefined && face.tintindex !== -1) f.ti = face.tintindex;

            faces[dirIdx] = f;
          }
        }

        const res: any = {
          f: el.from,
          t: el.to,
          fa: faces
        };

        if (el.rotation) {
          res.r = {
            o: el.rotation.origin,
            a: AXIS_MAP[el.rotation.axis] ?? 0,
            angle: el.rotation.angle
          };
          if (el.rotation.rescale) res.r.re = true;
        }

        if (el.render_layer) {
            res.l = LAYER_MAP[el.render_layer] ?? 0;
        }

        return res;
      }),
      m: maskPack.masks8
    };

    if (maskPack.masks16) {
      (optimizedTemp as any).m16 = maskPack.masks16;
      (optimizedTemp as any).mr = maskPack.maskRes;
    }

    const hash = hashTemplate(optimizedTemp);
    if (!templatePool[hash]) {
      const id = `t${nextTemplateId++}`;
      templatePool[hash] = id;
      idToTemplate[id] = optimizedTemp;
    }
    nameToId[name] = templatePool[hash];
  }

  // 2. 优化 Blocks
  const optimizedBlocks: any = {};
  const blockEntries = Object.entries(blocksJson);
  const totalBlocks = blockEntries.length;
  let processedBlocks = 0;

  for (const [name, block] of blockEntries) {
    processedBlocks++;
    if (processedBlocks % 100 === 0) Logger.progress(processedBlocks, totalBlocks, `Optimizing Blocks`);
    const props = propertiesJson[name] || { render_layer: 'solid' };

    let flags = LAYER_MAP[props.render_layer] || 0;
    if (props.is_decal) {
      flags |= (1 << 11);
    }
    let emissionColor = [255, 255, 255]; // Default white

    // Calculate emission either from global property OR aggregated from slots
    let maxIntensity = 0;
    let maxRadius = 0;
    let isLabPbr = false;
    let hasEmission = false;

    if (props.emission) {
      hasEmission = true;
      const e = props.emission;
      const normalizedIntensity = e.intensity > 1 ? e.intensity / 15 : e.intensity;
      maxIntensity = Math.min(15, Math.max(0, Math.round(normalizedIntensity * 15)));
      // Correction: If intensity is explicitly > 0 but rounded to 0 (very low), force to 1
      if (maxIntensity === 0 && e.intensity > 0) maxIntensity = 1;

      maxRadius = Math.min(15, Math.max(0, Math.round(e.radius)));
      isLabPbr = e.is_lab_pbr;
      emissionColor = [
        Math.floor(e.color[0] * 255),
        Math.floor(e.color[1] * 255),
        Math.floor(e.color[2] * 255)
      ];
    }


    if (hasEmission) {
      flags |= (maxIntensity << 2);
      flags |= (maxRadius << 6);
      if (isLabPbr) flags |= (1 << 10);
    }

    if (props.state_dependent_light) {
      flags |= (1 << 12);
    }

    if (block.use_variant_lut) {
      flags |= (1 << 13);
    }

    if (name.includes('redstone_block') || name.includes('repeater') || name.includes('comparator') || name.includes('redstone_torch')) {
         Logger.debug(`[OptDebug] ${name} Emissions: Global=${hasEmission} (I:${maxIntensity} R:${maxRadius} PBR:${isLabPbr})`);
         if (hasEmission) Logger.debug(`   Flags raw: ${flags} (Bin: ${flags.toString(2)})`);
    }

    if (block.use_variant_lut) {
         Logger.debug(`[OptDebug] ${name} uses Variant LUT (Flag bit 13 set). Pattern: ${block.pattern}`);
    }

    optimizedBlocks[name] = {
      p: block.pattern,
      f: flags,
      c: (hasEmission) ? emissionColor : undefined,
      s: block.slots.map((slot, idx) => {
        const templateId = nameToId[slot.template];
        if (!templateId) {
            Logger.error(`Template ${slot.template} not found for block ${name}`);
            return { t: slot.template, x: [] };
        }

        const temp = templatesJson[slot.template];
        const vars = Array.isArray(temp.texture_vars) ? temp.texture_vars : Object.keys(temp.texture_vars || {});

        const textures = vars.map(v => {
          const texName = slot.textures[v];
          if (!texName) return -1;
          const id = textureMap[normalizeTex(texName)];
          return id !== undefined ? id : -1;
        });

        // Pack per-slot emission if available
        let slotEmission: number[] | undefined;
        if (props.slot_emissions && props.slot_emissions[idx]) {
            const e = props.slot_emissions[idx];
            if (e) {
                const i = e.intensity > 1 ? Math.min(15, Math.round(e.intensity)) : Math.min(15, Math.round(e.intensity * 15));
                // Force minimal intensity if source > 0
                const finalI = (i === 0 && e.intensity > 0) ? 1 : i;

                // [R, G, B, Intensity] - normalized to u8
                slotEmission = [
                    Math.floor(e.color[0] * 255),
                    Math.floor(e.color[1] * 255),
                    Math.floor(e.color[2] * 255),
                    finalI
                ];
            }
        }

        return {
          t: templateId,
          x: textures,
          e: slotEmission
        };
      })
    };
  }

  // 3. 写入文件
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(path.join(outputDir, 'blocks.json'), JSON.stringify(optimizedBlocks));
  fs.writeFileSync(path.join(outputDir, 'templates.json'), JSON.stringify(idToTemplate));
  fs.writeFileSync(path.join(outputDir, 'patterns.json'), JSON.stringify(patternsJson));
  fs.writeFileSync(path.join(outputDir, 'texture_map.json'), JSON.stringify(textureMap));

  // cullingMasks.json 已被废弃，Rust Core 会在运行时通过几何体计算 Culling Mask
  const cullingMasksJson = {};

  // 4. 生成二进制压缩包 (Custom Binary Format)
  const binary = serializeRegistry(optimizedBlocks, patternsJson, idToTemplate, cullingMasksJson);
  const compressed = pako.deflate(binary);

  // 原始二进制保存到 intermediate，compiled 目录只保留压缩产物
  const compiledDir = context.compiledTextureDir;
  const rawBinaryPath = path.join(context.intermediateBinDir, 'resources.bin');
  const legacyCompiledBinaryPath = path.join(compiledDir, 'resources.bin');
  const deflatedBinaryPath = path.join(compiledDir, 'resources.bin.deflate');
  const legacyDeflateDir = path.join(compiledDir, 'deflate');

  // 将二进制也保存一份到 optimized 目录备份 (不再需要, 避免混淆)
  // fs.writeFileSync(path.join(outputDir, 'resources.bin'), binary);

  if (!fs.existsSync(compiledDir)) fs.mkdirSync(compiledDir, { recursive: true });
  if (!fs.existsSync(context.intermediateBinDir)) fs.mkdirSync(context.intermediateBinDir, { recursive: true });
  if (fs.existsSync(legacyCompiledBinaryPath)) fs.rmSync(legacyCompiledBinaryPath);
  if (fs.existsSync(legacyDeflateDir)) fs.rmSync(legacyDeflateDir, { recursive: true, force: true });

  fs.writeFileSync(rawBinaryPath, binary);
  fs.writeFileSync(deflatedBinaryPath, compressed);

  Logger.success(`[Optimizer] Done: ${compiledDir} (Binary: ${(binary.length / 1024).toFixed(2)} KB, Deflate: ${(compressed.length / 1024).toFixed(2)} KB)`);
}

// async function main() {
//    const contexts = getResourceContexts();
//    for (const context of contexts) {
//        await optimizeContext(context);
//    }
// }

// main().catch(console.error);
