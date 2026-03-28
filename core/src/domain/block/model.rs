//! # 运行时模型定义 (Block Model Runtime)
//!
//! ## 职责 (Responsibility)
//! 定义 Block Model 在内存中的运行时结构。此结构是 `schema.rs` 解析后的结果，专门优化用于 Meshing 过程。
//!
//! ## 输入/输出 (Input/Output)
//! - 被 `BlockModelManager` 生产。
//! - 被 `mesher` 模块消费以生成顶点。
//!
//! ## MC 机制 (MC Mechanism)
//! 对应 Minecraft JSON 模型中的 "Elements" 概念。处理 3D 坐标、UV 映射、旋转和剔除面逻辑。

use serde::{Deserialize, Serialize, Deserializer};
use std::collections::HashMap;
use crate::domain::block::def::RotationDef;

pub fn dir_from_str(s: &str) -> Option<usize> {
    match s {
        "up" => Some(0),
        "down" => Some(1),
        "north" => Some(2),
        "south" => Some(3),
        "west" => Some(4),
        "east" => Some(5),
        _ => None,
    }
}

pub fn dir_to_str(idx: usize) -> &'static str {
    match idx {
        0 => "up",
        1 => "down",
        2 => "north",
        3 => "south",
        4 => "west",
        5 => "east",
        _ => "up",
    }
}

/// 运行时 Block Model 结构。
///
/// # Note
/// 从 `schema` 定义解析并实例化后的具体模型结构。
/// 由一组 Element (长方体) 组成。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BlockModel {
    /// 构成模型的 Element 列表。
    pub elements: Vec<ModelElement>,
    /// 6个面的遮挡掩码 [Up, Down, North, South, West, East]
    /// 每个 u64 代表该面上 8x8 的像素网格状态 (1=不透明, 0=透明)
    #[serde(default = "default_masks")]
    pub masks: [u64; 6],
    /// 可选的 16x16 精度掩码。
    #[serde(default)]
    pub masks16: Option<[u64; 24]>,
    /// 面精度位图：bit=1 表示该面使用 16x16 掩码。
    #[serde(default)]
    pub mask_res: u8,
    
    /// Optional: Emission data for the specific model state.
    /// [R, G, B, Intensity]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emission: Option<[u8; 4]>,
}

fn default_masks() -> [u64; 6] {
    [0; 6]
}

/// 模型 Element（长方体）。
///
/// # Note
/// 对应 Minecraft JSON 模型中的 `element`。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ModelElement {
    /// 最小坐标 [x, y, z]，范围通常在 0-16 之间。
    pub from: [f32; 3],
    /// 最大坐标 [x, y, z]。
    pub to: [f32; 3],
    /// Element 的 6 个面的定义。索引 0-5 分别对应 up, down, north, south, west, east。
    #[serde(deserialize_with = "deserialize_faces_map")]
    pub faces: [Option<ModelFace>; 6],
    /// Element 的局部旋转（如果存在）。注意 Minecraft 限制旋转只能是 22.5 度的倍数且只能沿一个轴。
    pub rotation: Option<RotationDef>,
    
    // 以下属性来自 Variant Apply 阶段，不属于原始 Element 定义，
    // 但为了方便渲染处理，被注入到了这里。
    
    /// 整个模型的 X 轴旋转（角度）。
    pub x: Option<f32>,
    /// 整个模型的 Y 轴旋转（角度）。
    pub y: Option<f32>,
    /// UV Lock 标志：如果为 true，旋转模型时纹理不旋转。
    pub uvlock: Option<bool>,
    /// 渲染层级覆盖 (0=Solid, 1=Cutout, 2=CutoutMipped, 3=Translucent, 4=Decal)
    #[serde(rename = "l", skip_serializing_if = "Option::is_none")]
    pub render_layer: Option<u8>,
}

fn deserialize_faces_map<'de, D>(deserializer: D) -> Result<[Option<ModelFace>; 6], D::Error>
where
    D: Deserializer<'de>,
{
    let map: HashMap<String, ModelFace> = HashMap::deserialize(deserializer)?;
    let mut faces: [Option<ModelFace>; 6] = Default::default();
    for (k, v) in map {
        if let Some(idx) = dir_from_str(&k) {
            faces[idx] = Some(v);
        }
    }
    Ok(faces)
}

/// 模型面定义。
///
/// # Note
/// 描述长方体的一个面的渲染属性。
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ModelFace {
    /// 纹理的图集索引。
    /// 这个索引由 `BlockModelManager` 解析纹理名称后分配。
    pub texture: i32,
    /// UV 映射坐标 [u1, v1, u2, v2]。
    pub uv: [f32; 4],
    /// Cull Direction Index (0-5)。
    /// 如果设置了此值，当该方向有不透明 Block 遮挡时，此面将不被渲染。
    pub cullface: Option<i8>,
    /// Tint Index。
    /// 如果存在（通常 >= 0），该面会根据生物群系颜色进行着色（如草地、树叶）。
    pub tintindex: Option<i32>,
    /// 纹理在面上的局部旋转 (0, 90, 180, 270)。
    pub rotation: Option<f32>,
    /// 预计算的剔除方向索引 (0-5)，用于快速剔除检查。
    /// 此字段在模型构建阶段计算，不从 JSON 反序列化。
    #[serde(skip)]
    pub cull_dir: Option<usize>,
    /// 预计算的边界标志。如果为 true，表示该面在旋转后位于方块边界上。
    #[serde(skip)]
    pub is_boundary: bool,
}
