import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import type { ResourceContext, BlockDef, BlockPattern, TemplateDef } from '../core/types';
import { Logger } from '../core/Logger';
import { BlockParser } from '../core/Parser';
import { createResourceLoader } from '../core/ResourceLoader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeTextureName(name: string): string {
  let s = name.trim();
  if (s.startsWith('minecraft:')) s = s.slice('minecraft:'.length);
  if (s.startsWith('block/')) s = s.slice('block/'.length);
  if (s.endsWith('.png')) s = s.slice(0, -4);
  return s;
}

function toRotIndex(deg: number): number {
  const d = ((Math.round(deg / 90) % 4) + 4) % 4;
  return d;
}

type RawVariantRef = {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
  weight?: number;
};

type VariantModelTraits = {
  upDownTextures: Set<string>;
  mirroredTextures: Set<string>;
};

export async function processRandomVariants(context: ResourceContext): Promise<void> {
  Logger.info('Start processing random variants (pure LUT mode)...');

  const resourceLoader = createResourceLoader(context);
  const parser = new BlockParser(p => p, resourceLoader);

  const allowlistPath = path.resolve(__dirname, '../../data/random_block_allowlist.json');
  if (!fs.existsSync(allowlistPath)) {
    Logger.warn(`[WARN] Allowlist file not found: ${allowlistPath}.`);
    return;
  }

  const allowlistRaw: string[] = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
  const allowlist = allowlistRaw.map(v => v.replace(/^minecraft:/, ''));

  const blocks: Record<string, BlockDef> = JSON.parse(fs.readFileSync(context.blocksJsonPath, 'utf-8'));
  const patterns: Record<string, BlockPattern> = JSON.parse(fs.readFileSync(context.patternsJsonPath, 'utf-8'));
  const templates: Record<string, TemplateDef> = JSON.parse(
    fs.readFileSync(context.templatesJsonPath, 'utf-8'),
  );
  const manifest = JSON.parse(fs.readFileSync(context.textureManifestPath, 'utf-8')) as {
    textures: Array<{ name: string }>;
  };

  const textureNameToId = new Map<string, number>();
  manifest.textures.forEach((t, i) => textureNameToId.set(t.name, i));

  const lutWidth = 4;
  const lutRows = new Map<number, Uint8Array>();

  const ensureIdentityRow = (id: number): Uint8Array => {
    let row = lutRows.get(id);
    if (row) return row;
    row = new Uint8Array(lutWidth * 4);
    for (let i = 0; i < lutWidth; i++) {
      const idx = i * 4;
      row[idx] = (id >> 8) & 0xff;
      row[idx + 1] = id & 0xff;
      row[idx + 2] = 0;
      row[idx + 3] = 0;
    }
    lutRows.set(id, row);
    return row;
  };

  let patchedBlockCount = 0;

  const isIdentityRow = (id: number, row: Uint8Array): boolean => {
    for (let x = 0; x < lutWidth; x++) {
      const idx = x * 4;
      const hi = (id >> 8) & 0xff;
      const lo = id & 0xff;
      if (row[idx] !== hi || row[idx + 1] !== lo || row[idx + 2] !== 0 || row[idx + 3] !== 0) {
        return false;
      }
    }
    return true;
  };

  for (const blockName of allowlist) {
    const blockAny = blocks[blockName] as any;
    if (!blockAny) continue;

    const slots = (blockAny.slots ?? blockAny.s) as Array<any>;
    const patternId = (blockAny.pattern ?? blockAny.p) as string | undefined;
    if (!slots || slots.length === 0 || !patternId) continue;

    const pattern = patterns[patternId] as any;
    if (!pattern || !Array.isArray(pattern.rules) || pattern.rules.length === 0) continue;

    // For random variants, first rule apply usually carries all weighted variants.
    const firstRule = pattern.rules[0] as any;
    const applyList: Array<any> = Array.isArray(firstRule.apply)
      ? firstRule.apply
      : [{ slot: 0, y: 0, uvlock: false, weight: 1 }];

    if (!applyList.length) continue;

    const baseSlot = slots[0] ?? slots[(applyList[0]?.slot as number) ?? 0];
    if (!baseSlot || !baseSlot.textures) continue;

    const faceUsageByKey = new Map<string, { upDown: boolean; lateral: boolean }>();
    const templateName = String(baseSlot.template ?? '');
    const template = templates[templateName] as any;
    if (template?.elements && Array.isArray(template.elements)) {
      for (const el of template.elements as any[]) {
        if (!el?.faces) continue;
        for (const [faceName, faceDef] of Object.entries(el.faces as Record<string, any>)) {
          const texRef = String((faceDef as any)?.texture ?? '');
          if (!texRef.startsWith('#')) continue;
          const key = texRef.slice(1);
          if (!(key in (baseSlot.textures as Record<string, string>))) continue;

          const prev = faceUsageByKey.get(key) ?? { upDown: false, lateral: false };
          if (faceName === 'up' || faceName === 'down') prev.upDown = true;
          else prev.lateral = true;
          faceUsageByKey.set(key, prev);
        }
      }
    }

    // Rotation must come from original blockstates (generateBlocks purification strips it for allowlisted blocks).
    let rawList: RawVariantRef[] = [];
    let rawState: any = null;
    for (const packPath of context.packPaths) {
      const p1 = path.join(packPath, 'assets/minecraft/blockstates', `${blockName}.json`);
      const p2 = path.join(packPath, 'blockstates', `${blockName}.json`);
      if (fs.existsSync(p1)) {
        rawState = JSON.parse(fs.readFileSync(p1, 'utf-8'));
        break;
      }
      if (fs.existsSync(p2)) {
        rawState = JSON.parse(fs.readFileSync(p2, 'utf-8'));
        break;
      }
    }

    if (rawState?.variants) {
      for (const key of Object.keys(rawState.variants)) {
        const v = rawState.variants[key];
        if (Array.isArray(v) && v.length > 0) {
          rawList = v as RawVariantRef[];
          break;
        }
      }
    }

    if (rawList.length === 0) {
      // Fallback: no raw array variant found, use a single zero-rotation descriptor.
      rawList = [{ model: '', y: 0, uvlock: false, weight: 1 }];
    }

    const variantTraits: VariantModelTraits[] = [];
    for (const rawRef of rawList) {
      const traits: VariantModelTraits = {
        upDownTextures: new Set<string>(),
        mirroredTextures: new Set<string>(),
      };

      try {
        if (rawRef.model && rawRef.model.trim() !== '') {
          const resolved = await parser.resolveModel(rawRef.model);
          for (const el of resolved.elements ?? []) {
            const faces = (el as any).faces as Record<string, any>;
            if (!faces) continue;
            for (const [faceName, faceDef] of Object.entries(faces)) {
              const texName = normalizeTextureName(String((faceDef as any)?.texture ?? ''));
              if (!texName) continue;

              if (faceName === 'up' || faceName === 'down') {
                traits.upDownTextures.add(texName);
              }

              const uv = (faceDef as any)?.uv as number[] | undefined;
              if (Array.isArray(uv) && uv.length >= 4) {
                // Consider UV mirrored when either axis is reversed.
                if (uv[0] > uv[2] || uv[1] > uv[3]) {
                  traits.mirroredTextures.add(texName);
                }
              }
            }
          }
        }
      } catch {
        // Keep fallback behavior if model parsing fails for a variant.
      }

      variantTraits.push(traits);
    }

    const rotateByBaseTexId = new Map<number, boolean>();
    for (const [texKey, baseTexNameRaw] of Object.entries(baseSlot.textures as Record<string, string>)) {
      const baseTexName = normalizeTextureName(baseTexNameRaw);
      const baseTexId = textureNameToId.get(baseTexName);
      if (baseTexId === undefined) continue;

      const usage = faceUsageByKey.get(texKey);
      const shouldRotateThisKey = usage
        ? usage.upDown
        : /^(all|top|bottom|up|down|end)$/i.test(texKey);

      rotateByBaseTexId.set(baseTexId, (rotateByBaseTexId.get(baseTexId) ?? false) || shouldRotateThisKey);
    }

    const processedBaseTexIds = new Set<number>();
    for (const [texKey, baseTexNameRaw] of Object.entries(baseSlot.textures as Record<string, string>)) {
      const baseTexName = normalizeTextureName(baseTexNameRaw);
      const baseTexId = textureNameToId.get(baseTexName);
      if (baseTexId === undefined) continue;
      if (processedBaseTexIds.has(baseTexId)) continue;
      processedBaseTexIds.add(baseTexId);

      const shouldRotateThisKey = rotateByBaseTexId.get(baseTexId) ?? false;

      const row = ensureIdentityRow(baseTexId);

      for (let v = 0; v < lutWidth; v++) {
        const ref = applyList[v % applyList.length] ?? { slot: 0, y: 0, uvlock: false };
        const rawRef = rawList[v % rawList.length] ?? { model: '', y: 0, uvlock: false };
        const traits = variantTraits[v % variantTraits.length] ?? {
          upDownTextures: new Set<string>(),
          mirroredTextures: new Set<string>(),
        };
        const slotIdx = Number(ref.slot ?? 0);
        const targetSlot = slots[slotIdx] ?? baseSlot;

        const targetTexNameRaw = (targetSlot.textures?.[texKey] as string | undefined) ?? baseTexNameRaw;
        const targetTexName = normalizeTextureName(targetTexNameRaw);
        const targetTexId = textureNameToId.get(targetTexName) ?? baseTexId;

        const slotY = Number(targetSlot.y ?? 0);
        const rawY = Number(rawRef.y ?? 0);
        const uvLocked = Boolean(rawRef.uvlock ?? false);
        const shouldRotateThisVariant = shouldRotateThisKey || traits.upDownTextures.has(targetTexName);
        const rot = shouldRotateThisVariant && !uvLocked ? toRotIndex(slotY + rawY) : 0;

        const mirror = traits.mirroredTextures.has(targetTexName) || Boolean(ref.mirror ?? false);
        const idx = v * 4;
        row[idx] = (targetTexId >> 8) & 0xff;
        row[idx + 1] = targetTexId & 0xff;
        row[idx + 2] = rot & 0xff;
        row[idx + 3] = mirror ? 1 : 0;
      }
    }

    patchedBlockCount++;
  }

  // Compact single-texture layout:
  // Row 0: header
  //   (0,0): entryCount (RG = u16)
  //   (1,0): dataRowCount (RG = u16)
  // Rows [1 .. entryCount]: sparse index entries
  //   (0,y): baseTextureId (RG = u16)
  //   (1,y): dataRowIndex  (RG = u16)
  // Rows after entries: data rows (4 variant columns)
  //   (x,y): RG=targetTexId, B=rot, A=mirror
  // If a base texture has no entry, shader falls back to identity mapping.
  const sparseEntries: Array<{ baseId: number; rowBytes: Uint8Array }> = [];
  for (const [baseId, row] of lutRows.entries()) {
    if (!isIdentityRow(baseId, row)) {
      sparseEntries.push({ baseId, rowBytes: row });
    }
  }

  // Deduplicate identical data rows to shrink texture further.
  const dataRowKeyToIndex = new Map<string, number>();
  const dataRows: Uint8Array[] = [];
  const entryToDataRowIndex: Array<{ baseId: number; dataRowIndex: number }> = [];
  for (const e of sparseEntries) {
    const key = Array.from(e.rowBytes).join(',');
    let dataIdx = dataRowKeyToIndex.get(key);
    if (dataIdx === undefined) {
      dataIdx = dataRows.length;
      dataRows.push(e.rowBytes);
      dataRowKeyToIndex.set(key, dataIdx);
    }
    entryToDataRowIndex.push({ baseId: e.baseId, dataRowIndex: dataIdx });
  }

  const entryCount = entryToDataRowIndex.length;
  const dataRowCount = dataRows.length;
  const lutHeight = Math.max(1, 1 + entryCount + dataRowCount);
  const png = new PNG({ width: lutWidth, height: lutHeight });

  // Header row
  {
    const i0 = 0;
    png.data[i0] = (entryCount >> 8) & 0xff;
    png.data[i0 + 1] = entryCount & 0xff;
    png.data[i0 + 2] = 0;
    png.data[i0 + 3] = 0;

    const i1 = 4;
    png.data[i1] = (dataRowCount >> 8) & 0xff;
    png.data[i1 + 1] = dataRowCount & 0xff;
    png.data[i1 + 2] = 0;
    png.data[i1 + 3] = 0;
  }

  // Sparse entry rows
  for (let i = 0; i < entryCount; i++) {
    const y = 1 + i;
    const rowStart = y * lutWidth * 4;
    const e = entryToDataRowIndex[i];

    // (0,y): baseId
    png.data[rowStart] = (e.baseId >> 8) & 0xff;
    png.data[rowStart + 1] = e.baseId & 0xff;
    png.data[rowStart + 2] = 0;
    png.data[rowStart + 3] = 0;

    // (1,y): dataRowIndex
    png.data[rowStart + 4] = (e.dataRowIndex >> 8) & 0xff;
    png.data[rowStart + 5] = e.dataRowIndex & 0xff;
    png.data[rowStart + 6] = 0;
    png.data[rowStart + 7] = 0;
  }

  // Data rows
  for (let i = 0; i < dataRowCount; i++) {
    const y = 1 + entryCount + i;
    const rowStart = y * lutWidth * 4;
    const row = dataRows[i];
    for (let b = 0; b < lutWidth * 4; b++) {
      png.data[rowStart + b] = row[b];
    }
  }

  if (!fs.existsSync(context.assetsDir)) {
    fs.mkdirSync(context.assetsDir, { recursive: true });
  }

  const variantLutPath = path.join(context.assetsDir, 'variant_lut.png');
  fs.writeFileSync(variantLutPath, PNG.sync.write(png));

  const legacyPaths = [
    path.join(context.compiledTextureDir, 'variation_lut.png'),
    path.join(context.compiledTextureDir, 'variant_lut.png'),
  ];
  for (const legacyPath of legacyPaths) {
    if (fs.existsSync(legacyPath)) {
      fs.rmSync(legacyPath);
    }
  }

  Logger.info(`LUT patched blocks: ${patchedBlockCount}/${allowlist.length}`);
  Logger.info(`LUT compact entries: ${entryCount}, data rows: ${dataRowCount}, height: ${lutHeight}`);
  Logger.success(`Generated Variant LUT at ${variantLutPath}`);
}
