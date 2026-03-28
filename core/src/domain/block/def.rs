//! # 模型结构定义 (Block Model Schema)
//!
//! ## 职责 (Responsibility)
//! 定义 Minecraft 资源文件（`blockstates/*.json`, `models/**/*.json`）的序列化/反序列化结构。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入: 原始 JSON 字符串。
//! - 输出: Rust 结构体 (`BlockDef`, `PatternDef`, `TemplateDef`)。
//!
//! ## MC 机制 (MC Mechanism)
//! - BlockStates: 决定不同 BlockState 下使用哪个 Model。
//! - Models: 定义 Cuboids (Elements) 和纹理。
//! - Multipart/Variant: 复杂的模型选择逻辑。

use serde::{Deserialize, Serialize};
use rustc_hash::FxHashMap;

/// 可为空的字符串包装器。
///
/// # Note
/// 处理 JSON 中可能是字符串也可能是 `null` 的字段。
#[derive(Serialize, Deserialize, Debug, Clone, Hash, PartialEq, Eq)]
#[serde(untagged)]
pub enum StringOrNull {
    Str(String),
    Null(Option<()>),
}

impl StringOrNull {
    pub fn into_string(self) -> String {
        match self {
            StringOrNull::Str(s) => s,
            StringOrNull::Null(_) => String::new(),
        }
    }

    pub fn as_opt(&self) -> Option<&str> {
        match self {
            StringOrNull::Str(s) => Some(s.as_str()),
            StringOrNull::Null(_) => None,
        }
    }
}

/// 模型 Slot 定义。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SlotDef {
    /// Template 名称引用。
    #[serde(rename = "t")]
    pub template: String,
    /// 纹理 ID 列表。顺序对应 Template 的 texture_vars。
    #[serde(rename = "x")]
    pub textures: Vec<i32>,
    /// 可选：特定槽位的发光覆盖 [R, G, B, Intensity]
    #[serde(rename = "e", skip_serializing_if = "Option::is_none")]
    pub emission: Option<[u8; 4]>,
}

/// 优化后的方块定义。
///
/// # Note
/// 整合了原本的 BlockDef 和 BlockProperties。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BlockDef {
    /// Pattern 名称引用。
    #[serde(rename = "p")]
    pub pattern: String,
    /// 压缩后的标志位。
    #[serde(rename = "f")]
    pub flags: u16,
    /// 压缩后的发光颜色 [R, G, B]。
    #[serde(rename = "c")]
    pub emission_color: Option<[u8; 3]>,
    /// 变体 Slot 列表。
    #[serde(rename = "s")]
    pub slots: Vec<SlotDef>,
}

impl BlockDef {
    pub fn get_render_layer(&self) -> u8 {
        (self.flags & 0b11) as u8
    }

    pub fn get_emission_intensity(&self) -> f32 {
        ((self.flags >> 2) & 0xF) as f32 / 15.0
    }

    pub fn get_emission_radius(&self) -> f32 {
        ((self.flags >> 6) & 0xF) as f32
    }

    pub fn is_lab_pbr(&self) -> bool {
        (self.flags & (1 << 10)) != 0
    }

    pub fn is_state_dependent_light(&self) -> bool {
        (self.flags & (1 << 12)) != 0
    }

    pub fn is_decal(&self) -> bool {
        (self.flags & (1 << 11)) != 0
    }
}

pub type BlocksJson = FxHashMap<String, BlockDef>;

/// 应用规则定义。
///
/// # Note
/// 当规则匹配时应用的模型变换和 Slot 选择。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApplyDef {
    /// 对应 `BlockDef` 中 `slots` 数组的索引。
    pub slot: i32,
    /// 绕 X 轴旋转角度。
    pub x: Option<f32>,
    /// 绕 Y 轴旋转角度。
    pub y: Option<f32>,
    /// 是否开启 UV Lock（纹理不随模型旋转）。
    pub uvlock: Option<bool>,
    /// 随机权重。用于随机 Variant。
    pub weight: Option<u32>,
}

/// 条件值类型。
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum ConditionValue {
    String(String),
    Number(f64),
    Bool(bool),
    Null(Option<()>),
}

/// 条件定义。
///
/// 用于 `multipart` 模型规则中的 `when` 子句。
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum Condition {
    /// 键值对映射条件。所有键值对必须同时满足（AND）。
    /// 特殊键 "OR" 可包含子条件列表。
    Map(FxHashMap<String, ConditionOrList>),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum ConditionOrList {
    Value(ConditionValue),
    List(Vec<Condition>),
}

/// 模式匹配规则。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RuleDef {
    /// 基于属性顺序的值列表匹配（用于简单状态机）。
    pub values: Option<Vec<ConditionValue>>,
    /// 基于条件的匹配（用于 multipart）。
    pub when: Option<Condition>,
    /// 匹配成功后应用的变换列表（如果是列表则从中随机选择）。
    pub apply: Vec<ApplyDef>,
}

/// 模式定义。
///
/// 类似于 Minecraft 的 blockstate 文件，定义如何根据属性选择模型。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PatternDef {
    #[serde(rename = "type")]
    pub type_: Option<String>,
    /// 该模式关心的属性名列表（对应 `values` 中的顺序）。
    pub properties: Option<Vec<String>>,
    /// 规则列表。
    pub rules: Vec<RuleDef>,
}

pub type PatternsJson = FxHashMap<String, PatternDef>;

/// 模板面定义。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FaceDef {
    /// 纹理索引 (如果 >= 0 则是 Slot 内索引，如果 < 0 则是经 -(id+1) 转换后的全局ID)。
    #[serde(rename = "t")]
    pub texture: i32,
    /// 压缩后的 UV (u32)。0 表示默认 [0,0,16,16]。
    #[serde(rename = "u", default)]
    pub uv_packed: u32,
    /// Cull direction index (0-5)。
    #[serde(rename = "c")]
    pub cullface: Option<i8>,
    #[serde(rename = "r", default)]
    pub rotation: f32,
    #[serde(rename = "ti", default = "default_tintindex")]
    pub tintindex: i32,
}

impl FaceDef {
    pub fn get_uv(&self) -> [f32; 4] {
        if self.uv_packed == 0 {
            [0.0, 0.0, 16.0, 16.0]
        } else {
            [
                ((self.uv_packed >> 24) & 0xFF) as f32 / 10.0,
                ((self.uv_packed >> 16) & 0xFF) as f32 / 10.0,
                ((self.uv_packed >> 8) & 0xFF) as f32 / 10.0,
                (self.uv_packed & 0xFF) as f32 / 10.0,
            ]
        }
    }
}

fn default_tintindex() -> i32 { -1 }

/// 元素旋转定义。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RotationDef {
    #[serde(rename = "o")]
    pub origin: [f32; 3],
    #[serde(rename = "a")]
    pub axis: u8,
    pub angle: f32,
    #[serde(rename = "re", default)]
    pub rescale: bool,
}

/// 模板元素 definition。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ElementDef {
    #[serde(rename = "f")]
    pub from: [f32; 3],
    #[serde(rename = "t")]
    pub to: [f32; 3],
    #[serde(rename = "r")]
    pub rotation: Option<RotationDef>,
    /// 固定顺序的面定义: [up, down, north, south, west, east]
    #[serde(rename = "fa")]
    pub faces: [Option<FaceDef>; 6],
    /// 渲染层级覆盖 (可选)
    #[serde(rename = "l", default)]
    pub render_layer: Option<u8>,
}

/// 模型模板定义。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TemplateDef {
    /// 构成的元素列表。
    #[serde(rename = "e")]
    pub elements: Vec<ElementDef>,
    /// 模板定义的纹理变量名列表。
    #[serde(rename = "v")]
    pub texture_vars: Vec<String>,
    /// 几何遮挡掩码 (预计算)。
    /// 顺序: [Up, Down, North, South, West, East]
    /// 每个 u64 代表 8x8 网格覆盖情况。
    #[serde(skip, default)]
    pub masks: [u64; 6],
    /// 可选的 16x16 精度掩码。
    /// 顺序: 6 个面，每个面 4 个 8x8 子块 (2x2 tiles)。
    #[serde(skip, default)]
    pub masks16: Option<[u64; 24]>,
    /// 面精度位图：bit=1 表示该面使用 16x16 掩码。
    #[serde(skip, default)]
    pub mask_res: u8,
}


pub type TemplatesJson = FxHashMap<String, TemplateDef>;

/// 注册表数据的二进制容器，用于快速导出/导入。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RegistryBinaryContainer {
    pub blocks: BlocksJson,
    pub patterns: PatternsJson,
    pub templates: TemplatesJson,
    pub culling_masks: FxHashMap<String, i32>,
}
