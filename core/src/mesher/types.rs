//! # Mesher 共享类型定义 (Mesher Types)
//!
//! ## 职责
//! 定义 mesher 过程中反复传递的共享数据结构，包括光源提取结果、邻域引用、缓存方块信息与运行选项。
//!
//! ## 输入/输出
//! 这些类型本身不执行 meshing，只作为 generator / greedy / service / artifact 各层之间的公共契约。

use std::rc::Rc;
use std::cell::Cell;
use crate::io::anvil::chunk::ChunkData;
use crate::domain::block::model::BlockModel;
use crate::domain::block::{BlockId, CachedBlockProperties};

/// 从 Chunk 中提取的光源信息。
#[derive(Clone, Debug, serde::Serialize)]
pub struct ExtractedLight {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub intensity: f32,
    pub radius: f32,
}

/// 渲染层级。
#[derive(PartialEq, Eq, Clone, Copy)]
pub enum RenderLayer {
    Solid,
    Cutout,
    CutoutMipped,
    Translucent,
}

/// 半砖类型。
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SlabType {
    None,
    Bottom,
    Top,
    Double,
}

/// 缓存的 Block 信息。
#[derive(Clone)]
pub struct CachedBlockInfo {
    pub id: BlockId,
    pub model: Option<Rc<BlockModel>>,
    pub properties: CachedBlockProperties,
}

/// Chunk 邻域结构 (3x3)。
/// 只覆盖水平八邻域，垂直方向仍通过 Section / world_y 在单个 Chunk 内访问。
pub struct Neighborhood<'a> {
    pub center: &'a ChunkData,
    pub north: Option<&'a ChunkData>,
    pub south: Option<&'a ChunkData>,
    pub east: Option<&'a ChunkData>,
    pub west: Option<&'a ChunkData>,
    pub north_east: Option<&'a ChunkData>,
    pub north_west: Option<&'a ChunkData>,
    pub south_east: Option<&'a ChunkData>,
    pub south_west: Option<&'a ChunkData>,
}

/// Mesher 行为开关。
/// - `vertex_lighting`: 是否把光照编码进顶点，并在 greedy merge 时按光照边界拆分。
/// - `smooth_lighting`: 是否对顶点角点做平滑采样；关闭时退回面级 flat light。
/// - `vertex_ao`: 是否在 smooth lighting 基础上叠加 AO 衰减。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MesherOptions {
    pub vertex_lighting: bool,
    pub smooth_lighting: bool,
    pub vertex_ao: bool,
}

impl Default for MesherOptions {
    fn default() -> Self {
        Self {
            vertex_lighting: true,
            smooth_lighting: true,
            vertex_ao: true,
        }
    }
}

thread_local! {
    // Bit 0: vertex_lighting, Bit 1: smooth_lighting, Bit 2: vertex_ao
    static CURRENT_MESHER_OPTIONS_BITS: Cell<u8> = Cell::new(0b111);
}

impl MesherOptions {
    #[inline]
    /// 归一化选项依赖关系。
    /// smooth_lighting 依赖 vertex_lighting，vertex_ao 又依赖 smooth_lighting。
    fn normalized(mut self) -> Self {
        if !self.vertex_lighting {
            self.smooth_lighting = false;
        }
        if !self.smooth_lighting {
            self.vertex_ao = false;
        }
        self
    }

    #[inline]
    /// 把选项压缩成 3 bit 状态。
    fn to_bits(self) -> u8 {
        let opt = self.normalized();
        (opt.vertex_lighting as u8)
            | ((opt.smooth_lighting as u8) << 1)
            | ((opt.vertex_ao as u8) << 2)
    }

    #[inline]
    /// 从 bit 状态恢复选项并重新做依赖归一化。
    fn from_bits(bits: u8) -> Self {
        MesherOptions {
            vertex_lighting: (bits & 0b001) != 0,
            smooth_lighting: (bits & 0b010) != 0,
            vertex_ao: (bits & 0b100) != 0,
        }
        .normalized()
    }
}

/// 更新当前线程上的 mesher 选项。
pub(crate) fn set_current_mesher_options(options: MesherOptions) {
    let bits = options.to_bits();
    CURRENT_MESHER_OPTIONS_BITS.with(|v| v.set(bits));
}

/// 读取当前线程上的 mesher 选项。
pub(crate) fn get_current_mesher_options() -> MesherOptions {
    CURRENT_MESHER_OPTIONS_BITS.with(|v| MesherOptions::from_bits(v.get()))
}
