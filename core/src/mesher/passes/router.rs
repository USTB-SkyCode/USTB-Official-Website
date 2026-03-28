//! # Pass 路由器 (Pass Router)
//!
//! ## 职责
//! 根据方块类型把几何写入不同渲染 pass，目前主要负责纯流体与 waterlogged 流体的分流。

use crate::domain::block::BlockModelManager;
use crate::mesher::context::SectionContext;
use crate::mesher::passes::fluid::mesh_fluid_block;
use crate::mesher::services::neighbor::NeighborAccess;
use crate::mesher::types::{CachedBlockInfo, MesherOptions};

/// 各渲染 pass 的目标缓冲视图。
pub struct PassBuffers<'a> {
    pub opaque: &'a mut Vec<u8>,
    pub opaque_indices: &'a mut Vec<u32>,
    pub decal: &'a mut Vec<u8>,
    pub decal_indices: &'a mut Vec<u32>,
    pub translucent: &'a mut Vec<u8>,
    pub translucent_indices: &'a mut Vec<u32>,
}

/// 渲染 pass 路由器。
/// 当前主要承接流体路径，后续可以继续扩展到 decal / special material 等专用 pass。
pub struct PassRouter<'a> {
    section_ctx: &'a SectionContext<'a>,
    neighbors: NeighborAccess<'a>,
    manager: &'a BlockModelManager,
    options: MesherOptions,
}

impl<'a> PassRouter<'a> {
    pub fn new(section_ctx: &'a SectionContext<'a>) -> Self {
        Self {
            section_ctx,
            neighbors: NeighborAccess::new(section_ctx),
            manager: section_ctx.ctx.manager,
            options: section_ctx.ctx.options,
        }
    }

    pub fn neighbors(&self) -> &NeighborAccess<'a> {
        &self.neighbors
    }

    /// 处理纯水或纯岩浆方块。
    /// 水写入 translucent，岩浆写入 opaque。
    pub fn emit_pure_fluid(
        &self,
        buffers: &mut PassBuffers<'_>,
        info: &CachedBlockInfo,
        x: i32,
        y: i32,
        z: i32,
    ) -> bool {
        let name = info.properties.name.as_str();
        let is_pure_water = name == "water";
        let is_pure_lava = name == "lava";
        if !is_pure_water && !is_pure_lava {
            return false;
        }

        let global_y = (self.section_ctx.base_y + y) as f32;
        let (buf, idx) = if is_pure_lava {
            (&mut *buffers.opaque, &mut *buffers.opaque_indices)
        } else {
            (&mut *buffers.translucent, &mut *buffers.translucent_indices)
        };

        let _ = mesh_fluid_block(
            buf,
            idx,
            self.manager,
            self.section_ctx.ctx.neighborhood,
            &self.neighbors,
            self.section_ctx.section_y,
            x,
            y,
            z,
            global_y,
            info,
            self.options,
        );

        true
    }

    /// 处理 waterlogged 流体补面。
    /// 始终写入 translucent 缓冲，与宿主方块基础几何分离。
    pub fn emit_waterlogged(
        &self,
        buffers: &mut PassBuffers<'_>,
        info: &CachedBlockInfo,
        x: i32,
        y: i32,
        z: i32,
    ) {
        let global_y = (self.section_ctx.base_y + y) as f32;
        let _ = mesh_fluid_block(
            &mut *buffers.translucent,
            &mut *buffers.translucent_indices,
            self.manager,
            self.section_ctx.ctx.neighborhood,
            &self.neighbors,
            self.section_ctx.section_y,
            x,
            y,
            z,
            global_y,
            info,
            self.options,
        );
    }
}
