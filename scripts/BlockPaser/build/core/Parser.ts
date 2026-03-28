import {
  RawBlockState,
  RawModel,
  ResolvedModel,
  BlockRenderState,
  Vec3,
  Vec4
} from './types';
import { Logger } from './Logger';

// ==========================================
// 核心解析类
// ==========================================

export class BlockParser {
  private modelCache = new Map<string, RawModel>();
  private resolvedModelCache = new Map<string, ResolvedModel>();
  private texturePathResolver: (path: string) => string;
  private resourceLoader: (path: string) => Promise<any>;

  // 自定义模型支持 (处理水、岩浆、箱子等特殊方块)
  private customBlockHandlers = new Map<string, (props: Record<string, any>) => ResolvedModel[]>();

  constructor(
    texturePathResolver?: (path: string) => string,
    resourceLoader?: (path: string) => Promise<any>,
  ) {
    this.texturePathResolver = texturePathResolver || (p => p);
    this.resourceLoader =
      resourceLoader ||
      (async path => {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to load resource: ${path}`);
        return res.json();
      });
  }

  // -------------------------------------------------------
  // 资源加载 (模拟 fetch，实际项目中应替换为真实网络请求)
  // -------------------------------------------------------
  private async fetchBlockState(name: string): Promise<RawBlockState> {
    // 路径已在 generateBlocks 中通过 resourceLoader 处理，此处使用相对资源根目录路径
    return this.resourceLoader(`assets/minecraft/blockstates/${name}.json`);
  }

  private async fetchModel(name: string): Promise<RawModel> {
    // Normalize name: remove namespace
    const cleanName = name.replace(/^minecraft:/, '');

    // Handle builtin models
    if (cleanName.startsWith('builtin/')) {
      return { textures: {} };
    }

    // Check cache
    if (this.modelCache.has(cleanName)) return this.modelCache.get(cleanName)!;

    let modelPath: string;
    // If it explicitly starts with a known folder, use it
    if (cleanName.startsWith('block/') || cleanName.startsWith('item/')) {
      modelPath = `assets/minecraft/models/${cleanName}.json`;
    } else {
      // Otherwise assume it's a block model
      modelPath = `assets/minecraft/models/block/${cleanName}.json`;
    }

    try {
      const data = await this.resourceLoader(modelPath);
      this.modelCache.set(cleanName, data);
      return data;
    } catch (e) {
      // Enhance error message
      throw new Error(`Failed to load model ${name} at ${modelPath}: ${e}`);
    }
  }

  // -------------------------------------------------------
  // 模型解析 (处理继承 Parent)
  // -------------------------------------------------------
  async resolveModel(modelName: string): Promise<ResolvedModel> {
    const cleanName = modelName.replace(/^minecraft:/, '');
    if (this.resolvedModelCache.has(cleanName)) {
      return this.resolvedModelCache.get(cleanName)!;
    }

    // 1. 加载当前模型及其所有父级链
    const hierarchy: RawModel[] = [];
    let currentName: string | undefined = cleanName;
    const visited = new Set<string>();

    while (currentName) {
      if (visited.has(currentName)) {
        Logger.warn(`Circular model dependency: ${currentName}`);
        break;
      }
      visited.add(currentName);

      try {
        const model = await this.fetchModel(currentName);
        hierarchy.unshift(model); // 父级在前，子级在后
        currentName = model.parent?.replace(/^minecraft:/, '');
      } catch (e) {
        Logger.error("Failed to fetch/parse model", e);
        break;
      }
    }

    // 2. 合并属性
    // 基础属性
    let ambientocclusion = true;
    // 纹理映射表 (变量名 -> 值)
    const textures: Record<string, string> = {};
    // 元素列表 (子级覆盖父级)
    let elements: RawModel['elements'] = undefined;

    for (const model of hierarchy) {
      if (model.ambientocclusion !== undefined) ambientocclusion = model.ambientocclusion;
      if (model.textures) {
        Object.assign(textures, model.textures);
      }
      if (model.elements) {
        elements = model.elements; // 只要子级定义了 elements，就完全覆盖父级
      }
    }

    // 3. 解析纹理引用 (处理 #texture 变量)
    const resolveTextureVar = (val: string): string => {
      if (!val.startsWith('#')) return val;
      const varName = val.substring(1);
      if (textures[varName]) {
        return resolveTextureVar(textures[varName]); // 递归解析
      }
      return val; // 无法解析，保留原样或返回空
    };

    const finalTextures: Record<string, string> = {};
    for (const key in textures) {
      finalTextures[key] = resolveTextureVar(textures[key]);
    }

    // 4. 处理 Elements 和 UV
    const finalElements: ResolvedModel['elements'] = [];
    if (elements) {
      for (const el of elements) {
        const newFaces: any = {};
        for (const faceDir in el.faces) {
          const face = el.faces[faceDir];
          const texturePath = resolveTextureVar(face.texture);

          // 自动计算 UV (Box UV)
          let uv = face.uv;
          if (!uv) {
            uv = this.calculateUV(faceDir, el.from, el.to);
          }

          newFaces[faceDir] = {
            ...face,
            texture: texturePath,
            uv,
          };
        }

        finalElements.push({
          from: el.from,
          to: el.to,
          rotation: el.rotation,
          shade: el.shade !== false,
          faces: newFaces,
        });
      }
    }

    const result: ResolvedModel = {
      name: cleanName,
      ambientocclusion,
      textures: finalTextures,
      elements: finalElements,
    };

    this.resolvedModelCache.set(cleanName, result);
    return result;
  }

  private calculateUV(face: string, from: Vec3, to: Vec3): Vec4 {
    const [x1, y1, z1] = from;
    const [x2, y2, z2] = to;
    const lowerFace = face.toLowerCase();

    switch (lowerFace) {
      case 'down':
      case 'bottom':
        return [x1, 16 - z2, x2, 16 - z1];
      case 'up':
      case 'top':
        return [x1, z1, x2, z2];
      case 'north':
        return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
      case 'south':
        return [x1, 16 - y2, x2, 16 - y1];
      case 'west':
        return [z1, 16 - y2, z2, 16 - y1];
      case 'east':
        return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
      default:
        console.warn(`[Parser] Default UV used for face: ${face} at coords ${from}-${to}. This may cause texture compression.`);
        return [0, 0, 16, 16];
    }
  }

  // -------------------------------------------------------
  // BlockState 解析 (生成所有状态组合)
  // -------------------------------------------------------
  async parseBlockState(blockName: string): Promise<{
    properties: Record<string, (string | number | boolean)[]>;
    states: Map<string, BlockRenderState>;
  }> {
    const bs = await this.fetchBlockState(blockName);

    // 1. 收集所有属性及其可能值
    const propMap = new Map<string, Set<string | number | boolean>>();

    const addProp = (key: string, val: string | number | boolean) => {
      if (!propMap.has(key)) propMap.set(key, new Set());
      propMap.get(key)!.add(val);
    };

    // 从 variants 键中提取
    if (bs.variants) {
      for (const key of Object.keys(bs.variants)) {
        if (key === '') continue; // default case
        key.split(',').forEach(part => {
          const [k, v] = part.split('=');
          if (k && v) addProp(k, this.parseValue(v));
        });
      }
    }
    // 从 multipart when 中提取
    if (bs.multipart) {
      bs.multipart.forEach(part => {
        if (part.when) {
          const conditions = (part.when as any).OR ? (part.when as any).OR : [part.when];
          conditions.forEach((cond: any) => {
            for (const k in cond) {
              addProp(k, this.parseValue(String(cond[k])));
            }
          });
        }
      });
    }

    // 2. 生成属性全排列
    const props: Record<string, (string | number | boolean)[]> = {};
    const propKeys: string[] = [];
    propMap.forEach((vals, key) => {
      props[key] = Array.from(vals).sort();
      propKeys.push(key);
    });
    propKeys.sort(); // 保证顺序一致

    const permutations = this.generatePermutations(props, propKeys);

    // 3. 为每个状态生成模型列表
    const stateMap = new Map<string, BlockRenderState>();

    // 检查是否有自定义处理器
    const customHandler = this.customBlockHandlers.get(blockName.replace(/^minecraft:/, ''));

    for (const perm of permutations) {
      const stateKey = this.generateStateKey(perm);
      let models: Array<{ model: ResolvedModel; x: number; y: number; uvlock: boolean }> = [];

      if (customHandler) {
        // 使用自定义处理器生成模型
        const customModels = customHandler(perm);
        models = customModels.map(m => ({ model: m, x: 0, y: 0, uvlock: false }));
      } else {
        // A. 处理 Variants
        if (bs.variants) {
          // 寻找最佳匹配的 variant key
          // 标准 Minecraft 匹配规则：完全匹配。
          // 但 variants map 中的 key 可能是 "facing=north,half=bottom"，而 perm 可能包含更多属性。
          // 实际上，variants 定义了该方块的所有有效状态。如果 perm 是从 variants 提取的，应该能找到精确匹配。
          // 除非有 multipart 混用。

          // 尝试构建匹配键
          // 注意：variants 中的 key 属性顺序可能不固定，需要归一化
          const variantMatch = Object.entries(bs.variants).find(([key]) => {
            if (key === '' || key === 'normal') return true; // 默认
            const parts = key.split(',');
            return parts.every(part => {
              const [k, v] = part.split('=');
              return String(perm[k]) === v;
            });
          });

          if (variantMatch) {
            const rawVariants = Array.isArray(variantMatch[1]) ? variantMatch[1] : [variantMatch[1]];
            // 这里简化处理：如果是数组（随机权重），我们只取第一个，或者你可以实现随机逻辑
            // 对于渲染器生成静态网格，通常取第一个或基于位置哈希
            const variant = rawVariants[0];
            const resolved = await this.resolveModel(variant.model);
            models.push({
              model: resolved,
              x: variant.x || 0,
              y: variant.y || 0,
              uvlock: variant.uvlock || false,
            });
          }
        }

        // B. 处理 Multipart
        if (bs.multipart) {
          for (const part of bs.multipart) {
            let match = true;
            if (part.when) {
              // 处理 OR 逻辑
              const conditions = (part.when as any).OR ? (part.when as any).OR : [part.when];
              // 只要有一个条件组满足即可 (OR)
              const anyGroupMatch = conditions.some((cond: any) => {
                // 组内所有条件必须满足 (AND)
                return Object.entries(cond).every(([k, v]) => {
                  // 属性值比较，注意类型转换
                  const stateVal = String(perm[k]);
                  const condVal = String(v);
                  // 处理 "a|b" 这种值 (虽然标准是 OR 列表，但有时会有简写)
                  return stateVal === condVal;
                });
              });
              match = anyGroupMatch;
            }

            if (match) {
              const rawVariants = Array.isArray(part.apply) ? part.apply : [part.apply];
              const variant = rawVariants[0]; // 同样简化取第一个
              const resolved = await this.resolveModel(variant.model);
              models.push({
                model: resolved,
                x: variant.x || 0,
                y: variant.y || 0,
                uvlock: variant.uvlock || false,
              });
            }
          }
        }
      }

      stateMap.set(stateKey, {
        id: stateKey,
        properties: perm,
        models,
      });
    }

    return {
      properties: props,
      states: stateMap,
    };
  }


  registerCustomHandler(
    blockName: string,
    handler: (props: Record<string, any>) => ResolvedModel[],
  ) {
    this.customBlockHandlers.set(blockName, handler);
  }

  // -------------------------------------------------------
  // 优化解析：模板 + 实例模式
  // -------------------------------------------------------

  // 获取模型所属的几何体模板（定义了 elements 的祖先）
  async findTemplate(
    modelName: string,
  ): Promise<{ name: string; elements: RawModel['elements'] } | null> {
    const cleanName = modelName.replace(/^minecraft:/, '');

    // 1. 检查缓存
    // 注意：这里我们需要一个新的缓存来存储 "模型 -> 模板名" 的映射，或者直接实时查找
    // 为了简单，我们实时查找，因为这个操作只在生成时运行一次

    let currentName: string | undefined = cleanName;
    const visited = new Set<string>();

    while (currentName) {
      if (visited.has(currentName)) break;
      visited.add(currentName);

      try {
        const model = await this.fetchModel(currentName);
        // 如果当前模型定义了 elements，它就是模板
        if (model.elements) {
          // 确保所有面都有 UV (处理 default16 缺失 UV 的情况)
          const elementsWithUV = model.elements.map(el => {
            const newFaces: any = {};
            for (const faceDir in el.faces) {
               const face = el.faces[faceDir];
               let uv = face.uv;
               if (!uv) {
                 uv = this.calculateUV(faceDir, el.from, el.to);
               }
               newFaces[faceDir] = { ...face, uv };
            }
            return { ...el, faces: newFaces };
          });
          return { name: currentName, elements: elementsWithUV };
        }
        // 否则继续向上找
        currentName = model.parent?.replace(/^minecraft:/, '');
      } catch (e) {
        console.error(`Error finding template for ${modelName}:`, e);
        break;
      }
    }
    return null;
  }

  // 解析模型相对于模板的纹理映射
  // 返回: { "#textureVar": "texturePath" }
  async resolveModelTextures(modelName: string): Promise<Record<string, string>> {
    const cleanName = modelName.replace(/^minecraft:/, '');

    // 1. 加载继承链
    const hierarchy: RawModel[] = [];
    let currentName: string | undefined = cleanName;
    const visited = new Set<string>();

    while (currentName) {
      if (visited.has(currentName)) break;
      visited.add(currentName);
      try {
        const model = await this.fetchModel(currentName);
        hierarchy.unshift(model); // 父在前
        currentName = model.parent?.replace(/^minecraft:/, '');
      } catch (e) {
        console.warn(`Error resolving textures for ${modelName} at ${currentName}:`, e);
        break;
      }
    }

    // 2. 合并纹理定义
    const textures: Record<string, string> = {};
    for (const model of hierarchy) {
      if (model.textures) {
        Object.assign(textures, model.textures);
      }
    }

    // 3. 解析引用 (只解析 #引用，保留最终路径)
    const resolved: Record<string, string> = {};

    const resolve = (val: string): string => {
      if (val.startsWith('#')) {
        const key = val.substring(1);
        if (textures[key]) return resolve(textures[key]);
        return val; // 无法解析，保留原样
      }
      return val;
    };

    for (const key in textures) {
      resolved[key] = resolve(textures[key]);
    }

    return resolved;
  }

  // -------------------------------------------------------
  // 辅助函数
  // -------------------------------------------------------
  private parseValue(val: string): string | number | boolean {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(Number(val))) return Number(val);
    return val;
  }

  private generatePermutations(
    props: Record<string, any[]>,
    keys: string[],
  ): Record<string, any>[] {
    if (keys.length === 0) return [{}];

    const firstKey = keys[0];
    const restKeys = keys.slice(1);
    const restPerms = this.generatePermutations(props, restKeys);
    const result: Record<string, any>[] = [];

    for (const val of props[firstKey]) {
      for (const perm of restPerms) {
        result.push({
          [firstKey]: val,
          ...perm,
        });
      }
    }
    return result;
  }

  private generateStateKey(perm: Record<string, any>): string {
    return Object.entries(perm)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  }
}
