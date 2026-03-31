import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';
import pako from 'pako';
import { PNG } from 'pngjs';
import type { ResourceContext } from '../core/types';

// ------------------------------------------
// 类型定义
// ------------------------------------------

interface TextureSource {
  name: string;
  colorPath?: string;
  normalPath?: string;
  specularPath?: string;
  mcmetaPath?: string;
}

interface TextureManifestEntry {
  name: string;
  width: number;
  height: number;
  hasNormal: boolean;
  hasSpecular: boolean;
  isAnimated: boolean;
  frames: number;
  meta?: unknown;
  offset: number;
  size: number;
}

interface TextureProperties {
  transparency: 'solid' | 'cutout' | 'translucent';
  hasAlpha: boolean;
  // Normalized bounds [minU, minV, maxU, maxV] in 0..1, optional.
  alpha_bounds?: [number, number, number, number];
  partial_alpha_bounds?: [number, number, number, number];
  emission?: { color: [number, number, number]; intensity: number };
}

import { Logger } from '../core/Logger';

// ------------------------------------------
// 工具方法
// ------------------------------------------

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function analyzeTransparency(data: Buffer, width: number, height: number, debugName?: string): {
  transparency: 'solid' | 'cutout' | 'translucent';
  hasAlpha: boolean;
  alpha_bounds?: [number, number, number, number];
  partial_alpha_bounds?: [number, number, number, number];
} | null {
  try {
    let hasAlpha = false;
    let partialAlphaCount = 0;
    const totalPixels = width * height;

    let minAx = width, minAy = height, maxAx = -1, maxAy = -1;
    let minPx = width, minPy = height, maxPx = -1, maxPy = -1;

    for (let i = 0; i < totalPixels; i++) {
      const alpha = data[i * 4 + 3];
      if (alpha < 255) {
        hasAlpha = true;
        const x = i % width;
        const y = Math.floor(i / width);
        if (x < minAx) minAx = x;
        if (y < minAy) minAy = y;
        if (x > maxAx) maxAx = x;
        if (y > maxAy) maxAy = y;
        if (alpha > 10 && alpha < 245) {
          partialAlphaCount++;
          if (x < minPx) minPx = x;
          if (y < minPy) minPy = y;
          if (x > maxPx) maxPx = x;
          if (y > maxPy) maxPy = y;
        }
      }
    }

    if (!hasAlpha) {
      return { transparency: 'solid', hasAlpha: false };
    }

    if (debugName && (debugName.includes('mangrove_roots') || debugName.includes('copper_grate'))) {
      Logger.debug(
        `[Transparency Debug] ${debugName}: Total=${totalPixels}, Partial=${partialAlphaCount}, Ratio=${(
          partialAlphaCount / totalPixels
        ).toFixed(4)}`,
      );
    }

    const alpha_bounds: [number, number, number, number] | undefined =
      maxAx >= 0
        ? [minAx / width, minAy / height, (maxAx + 1) / width, (maxAy + 1) / height]
        : undefined;

    const partial_alpha_bounds: [number, number, number, number] | undefined =
      maxPx >= 0
        ? [minPx / width, minPy / height, (maxPx + 1) / width, (maxPy + 1) / height]
        : undefined;

    if (partialAlphaCount > totalPixels * 0.1) {
      return { transparency: 'translucent', hasAlpha: true, alpha_bounds, partial_alpha_bounds };
    }
    return { transparency: 'cutout', hasAlpha: true, alpha_bounds, partial_alpha_bounds };
  } catch (error) {
    Logger.warn(`Failed to analyze transparency: ${debugName} - ${error}`);
    return null;
  }
}

function analyzeEmission(colorData: Buffer, specData: Buffer, width: number, height: number): { color: [number, number, number]; intensity: number } | null {
  try {
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let totalIntensity = 0;
    let emissivePixelCount = 0;
    let maxIntensity = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        const alpha = specData[idx + 3];

        if (alpha < 255) {
          const intensity = alpha / 254.0;
          if (intensity > 0.05) {
            const r = colorData[idx] / 255.0;
            const g = colorData[idx + 1] / 255.0;
            const b = colorData[idx + 2] / 255.0;

            totalR += r * intensity;
            totalG += g * intensity;
            totalB += b * intensity;

            totalIntensity += intensity;
            emissivePixelCount++;
            maxIntensity = Math.max(maxIntensity, intensity);
          }
        }
      }
    }

    if (emissivePixelCount > 0 && totalIntensity > 0) {
      const avgR = totalR / totalIntensity;
      const avgG = totalG / totalIntensity;
      const avgB = totalB / totalIntensity;

      return {
        color: [avgR, avgG, avgB],
        intensity: maxIntensity,
      };
    }
  } catch (error) {
    // ignore
  }
  return null;
}

function readPng(filePath: string): Promise<{ width: number; height: number; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const png = new PNG();

    stream.on('error', reject);
    png
      .on('parsed', function () {
        resolve({ width: this.width, height: this.height, data: this.data });
      })
      .on('error', reject);

    stream.pipe(png);
  });
}

function createPlaceholder(width: number, height: number, color: [number, number, number, number]): Buffer {
  const size = width * height * 4;
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i += 4) {
    buffer[i] = color[0];
    buffer[i + 1] = color[1];
    buffer[i + 2] = color[2];
    buffer[i + 3] = color[3];
  }
  return buffer;
}

// ------------------------------------------
// 主流程
// ------------------------------------------

export async function mergeTextures(context: ResourceContext): Promise<void> {
  Logger.info(`Start merging textures: ${context.resource.key} (${context.resource.label})`);
  Logger.debug(`Resource pack search order: ${context.packPaths.join(', ')}`);

  const outputDir = context.compiledTextureDir;
  ensureDirectory(outputDir);

  const manifestFile = context.textureManifestPath;
  const manifestBinFile = path.join(context.intermediateBinDir, 'textures.manifest.bin');
  const manifestDeflateFile = path.join(outputDir, 'textures.manifest.bin.deflate');

  const binFile = path.join(context.intermediateBinDir, 'textures.bin');
  const binDeflateFile = path.join(outputDir, 'textures.bin.deflate');
  const texturePropertiesOutput = context.texturePropertiesPath;
  const legacyCompiledManifestBinFile = path.join(outputDir, 'textures.manifest.bin');
  const legacyCompiledBinFile = path.join(outputDir, 'textures.bin');
  const legacyDeflateDir = path.join(outputDir, 'deflate');

  // 确保中间产物目录存在
  ensureDirectory(context.intermediateDir);
  ensureDirectory(context.intermediateBinDir);
  if (fs.existsSync(legacyCompiledManifestBinFile)) {
    fs.rmSync(legacyCompiledManifestBinFile);
  }
  if (fs.existsSync(legacyCompiledBinFile)) {
    fs.rmSync(legacyCompiledBinFile);
  }
  if (fs.existsSync(legacyDeflateDir)) {
    fs.rmSync(legacyDeflateDir, { recursive: true, force: true });
  }

  const textureMap = new Map<string, TextureSource>();

  // 扫描资源包，低优先级先入表，高优先级后覆盖
  for (let i = context.packPaths.length - 1; i >= 0; i--) {
    const packRoot = context.packPaths[i];
    let textureDir = path.join(packRoot, 'assets/minecraft/textures/block');
    if (!fs.existsSync(textureDir)) {
      textureDir = path.join(packRoot, 'textures/block');
    }
    if (!fs.existsSync(textureDir)) continue;

    const files = fs.readdirSync(textureDir);
    for (const file of files) {
      if (!file.endsWith('.png')) continue;

      const baseName = file.replace('.png', '');
      let type: 'color' | 'normal' | 'specular' = 'color';
      let key = baseName;

      if (baseName.endsWith('_n') || baseName.endsWith('_normal')) {
        type = 'normal';
        key = baseName.replace(/(_n|_normal)$/u, '');
      } else if (baseName.endsWith('_s') || baseName.endsWith('_spec') || baseName.endsWith('_specular')) {
        type = 'specular';
        key = baseName.replace(/(_s|_spec|_specular)$/u, '');
      }

      if (!textureMap.has(key)) {
        textureMap.set(key, { name: key });
      }
      const entry = textureMap.get(key)!;

      if (type === 'color') {
        entry.colorPath = path.join(textureDir, file);
        const metaPath = path.join(textureDir, `${file}.mcmeta`);
        if (fs.existsSync(metaPath)) {
          entry.mcmetaPath = metaPath;
        }
      } else if (type === 'normal') {
        entry.normalPath = path.join(textureDir, file);
      } else {
        entry.specularPath = path.join(textureDir, file);
      }
    }
  }

  Logger.info('Start merging textures and analyzing properties...');
  const textureProperties = new Map<string, TextureProperties>();

  const sortedNames = Array.from(textureMap.keys()).sort();
  const total = sortedNames.length;
  let processed = 0;

  const manifest: TextureManifestEntry[] = [];
  const rawFd = fs.openSync(binFile, 'w');
  let currentOffset = 0;

  for (const name of sortedNames) {
    processed++;
    Logger.progress(processed, total, `Processing ${name}`);
    const entry = textureMap.get(name)!;
    if (!entry.colorPath) continue;

    try {
      const colorImg = await readPng(entry.colorPath);
      const width = colorImg.width;
      const height = colorImg.height;

      // 1. 分析 - 透明度
      const props: TextureProperties = { transparency: 'solid', hasAlpha: false };
      const transResult = analyzeTransparency(colorImg.data, width, height, path.basename(entry.colorPath));
      if (transResult) {
        props.transparency = transResult.transparency;
        props.hasAlpha = transResult.hasAlpha;
        if (transResult.alpha_bounds) {
          props.alpha_bounds = transResult.alpha_bounds;
        }
        if (transResult.partial_alpha_bounds) {
          props.partial_alpha_bounds = transResult.partial_alpha_bounds;
        }
      }

      // 2. 准备贴图数据 (Normal, Specular)
      let normalData: Buffer;
      if (entry.normalPath) {
        const normalImg = await readPng(entry.normalPath);
        if (normalImg.width !== width || normalImg.height !== height) {
          Logger.warn(`Normal map size mismatch: ${name}, using placeholder.`);
          normalData = createPlaceholder(width, height, [128, 128, 255, 255]);
        } else {
          normalData = normalImg.data;
        }
      } else {
        normalData = createPlaceholder(width, height, [128, 128, 255, 255]);
      }

      let specularData: Buffer;
      let rawSpecularImg: { data: Buffer, width: number, height: number } | null = null;

      if (entry.specularPath) {
        const specularImg = await readPng(entry.specularPath);
        if (specularImg.width !== width || specularImg.height !== height) {
          console.warn(`高光贴图尺寸不匹配：${name}，使用占位贴图。`);
          specularData = createPlaceholder(width, height, [0, 0, 0, 255]);
        } else {
          specularData = specularImg.data;
          rawSpecularImg = specularImg;
        }
      } else {
        specularData = createPlaceholder(width, height, [0, 0, 0, 255]);
      }

      // 3. 分析 - 发光 (需 Color + Specular)
      if (context.resource.LABPBR && rawSpecularImg) {
        const emission = analyzeEmission(colorImg.data, rawSpecularImg.data, width, height);
        if (emission) {
            props.emission = emission;
        }
      }

      textureProperties.set(name, props);

      // 4. 打包元数据
      let meta: unknown;
      if (entry.mcmetaPath) {
        try {
          meta = JSON.parse(fs.readFileSync(entry.mcmetaPath, 'utf-8'));
        } catch (error) {
          console.warn(`无法解析动画元数据：${entry.mcmetaPath}`);
        }
      }

      const metaAnim = (meta as { animation?: { frames?: unknown[] } } | undefined)?.animation;
      const isAnimated = Boolean(metaAnim) || height > width;
      const frames = isAnimated ? (metaAnim?.frames?.length ?? height / width) : 1;

      const combined = Buffer.concat([colorImg.data, normalData, specularData]);
      manifest.push({
        name,
        width,
        height,
        hasNormal: Boolean(entry.normalPath),
        hasSpecular: Boolean(entry.specularPath),
        isAnimated,
        frames: typeof frames === 'number' ? frames : 1,
        meta,
        offset: currentOffset,
        size: combined.length,
      });

      fs.writeSync(rawFd, combined);
      currentOffset += combined.length;
    } catch (error) {
      console.error(`处理纹理 ${name} 时出错：`, error);
    }
  }

  Logger.success(`Texture analysis complete: ${textureProperties.size} entries.`);

  const propsJson: Record<string, TextureProperties> = {};
  for (const [name, props] of textureProperties) {
    propsJson[name] = props;
  }
  fs.writeFileSync(texturePropertiesOutput, JSON.stringify(propsJson, null, 2));

  // Close raw binary (already written incrementally)
  fs.closeSync(rawFd);
  const rawSize = fs.statSync(binFile).size;

  // Stream-compress: read raw → deflate → write compressed
  await pipeline(
    fs.createReadStream(binFile),
    zlib.createDeflate(),
    fs.createWriteStream(binDeflateFile),
  );
  const compressedSize = fs.statSync(binDeflateFile).size;

  const manifestJsonStr = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      textures: manifest,
    },
    null,
    2,
  );

  const manifestBuffer = Buffer.from(manifestJsonStr);
  fs.writeFileSync(manifestFile, manifestJsonStr);
  fs.writeFileSync(manifestBinFile, manifestBuffer);

  const manifestCompressed = Buffer.from(pako.deflate(manifestBuffer));
  fs.writeFileSync(manifestDeflateFile, manifestCompressed);

  Logger.success(`Texture packaging complete: ${manifest.length} textures.`);
  Logger.info(`Raw Binary: ${binFile} (${(rawSize / 1024 / 1024).toFixed(2)} MB)`);
  Logger.info(`Compressed (Deflate): ${binDeflateFile} (${(compressedSize / 1024 / 1024).toFixed(2)} MB)`);
}
