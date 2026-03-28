export interface ResourceDefinition {
  key: string;
  label: string;
  MAX_TEXTURE_SIZE: number;
  MODELS: string;
  LABPBR: boolean;
}

// ==========================================
// 基础几何类型
// ==========================================

export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

// ==========================================
// 构建上下文
// ==========================================

export interface ResourceContext {
  resource: ResourceDefinition;
  packPaths: string[];
  relativeBasePath: string;
  outputModelDir: string;
  assestDir: string;
  intermediateDir: string;
  intermediateBinDir: string;
  compiledTextureDir: string;
  templatesJsonPath: string;
  patternsJsonPath: string;
  blocksJsonPath: string;
  cullingMasksJsonPath: string;
  texturePropertiesPath: string;
  blockPropertiesPath: string;
  textureManifestPath: string;
}

// ==========================================
// 原始资源数据结构 (Raw JSON Structures)
// ==========================================

// Blockstates JSON 结构
export interface RawBlockState {
  variants?: Record<string, RawVariant | RawVariant[]>;
  multipart?: Array<{
    when?:
      | Record<string, string | boolean | number>
      | { OR: Array<Record<string, string | boolean | number>> };
    apply: RawVariant | RawVariant[];
  }>;
}

export interface RawVariant {
  model: string;
  x?: number; // Rotation X: 0, 90, 180, 270
  y?: number; // Rotation Y: 0, 90, 180, 270
  uvlock?: boolean;
  weight?: number;
}

// Model JSON 结构
export interface RawModel {
  parent?: string;
  ambientocclusion?: boolean;
  display?: Record<string, unknown>;
  textures?: Record<string, string>;
  elements?: Array<{
    from: Vec3;
    to: Vec3;
    rotation?: {
      origin: Vec3;
      axis: 'x' | 'y' | 'z';
      angle: number;
      rescale?: boolean;
    };
    shade?: boolean;
    faces: Record<
      string,
      {
        uv?: Vec4;
        texture: string;
        cullface?: string;
        rotation?: number;
        tintindex?: number;
      }
    >;
  }>;
}

// ==========================================
// 解析后的运行时结构 (Runtime Structures)
// ==========================================

// 解析后的模型结构 (去除了继承关系，纹理已解析)
export interface ResolvedModel {
  name: string;
  ambientocclusion: boolean;
  textures: Record<string, string>; // 最终的纹理映射 (变量名 -> 路径)
  elements: Array<{
    from: Vec3;
    to: Vec3;
    rotation?: {
      origin: Vec3;
      axis: 'x' | 'y' | 'z';
      angle: number;
      rescale?: boolean;
    };
    shade: boolean;
    faces: Record<
      string,
      {
        uv: Vec4; // 确保 UV 存在
        texture: string; // 最终的纹理路径 (不是 #变量)
        cullface?: string;
        tintindex?: number;
        rotation?: number;
      }
    >;
  }>;
}

// 一个方块在特定状态下的渲染数据
export interface BlockRenderState {
  id: string; // 状态标识，如 "facing=north,open=true"
  properties: Record<string, string | number | boolean>;
  models: Array<{
    model: ResolvedModel;
    x: number;
    y: number;
    uvlock: boolean;
  }>;
}

// ==========================================
// 优化后的数据结构 (Optimized Output Structures)
// ==========================================

// 模板定义 (templates.json)
export interface TemplateDef {
  elements: unknown[]; // RawModel['elements']
  texture_vars: string[];
}

// 抽象的模型引用（在 Pattern 中使用）
export interface AbstractModelRef {
  slot: number; // 对应 Block 定义中的 slots 数组索引
  x?: number;
  y?: number;
  z?: number;
  uvlock?: boolean;
  weight?: number;
}

// 具体的模型配置（在 Block 中使用）
export interface ConcreteModelConfig {
  template: string;
  textures: Record<string, string>;
  y?: number;  // Block Y rotation (stored for geometry-free variant handling)
}

// Pattern 规则定义
export interface VariantRule {
  values: Array<string | number | boolean | null>;
  apply: AbstractModelRef[];
}

export interface MultipartRule {
  when?:
    | Record<string, string | number | boolean>
    | { OR: Array<Record<string, string | number | boolean>> };
  apply: AbstractModelRef[];
}

// Block Pattern 定义 (patterns.json)
export interface BlockPattern {
  type: 'variants' | 'multipart';
  properties?: string[];
  rules: VariantRule[] | MultipartRule[];
}

// Block 定义 (blocks.json)
export interface BlockDef {
  pattern: string; // Pattern ID
  slots: ConcreteModelConfig[]; // 具体模型配置列表，对应 Pattern 中的 slot 索引
  use_variant_lut?: boolean;
  emission_color?: [number, number, number];
}
