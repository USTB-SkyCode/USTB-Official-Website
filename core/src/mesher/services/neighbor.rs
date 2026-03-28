//! # 邻居读取服务 (Neighbor Access)
//!
//! ## 职责
//! 为 mesher 提供统一的邻居读取入口，优先从当前 chunk 的 palette/props cache 读取，越界后再回退到邻域 chunk 查询。

use crate::domain::block::{BlockId, CachedBlockProperties};
use crate::mesher::culling::get_block_state_in_neighborhood;
use crate::mesher::context::SectionContext;

/// 邻居访问器。
/// 封装局部 Section 与整个 Neighborhood 的跨层查询逻辑。
pub struct NeighborAccess<'a> {
    section_ctx: &'a SectionContext<'a>,
}

impl<'a> NeighborAccess<'a> {
    pub fn new(section_ctx: &'a SectionContext<'a>) -> Self {
        Self { section_ctx }
    }

    /// 优先从当前 chunk 内部读取属性。
    /// 若 y 越过当前 Section，会尝试访问同一 chunk 的上下 Section。
    pub fn props_at_local(&self, x: i32, y: i32, z: i32) -> Option<&CachedBlockProperties> {
        if (0..16).contains(&x) && (0..16).contains(&y) && (0..16).contains(&z) {
            let idx = self.section_ctx.section.get_block_palette_index(x as usize, y as usize, z as usize);
            return self.section_ctx.palette.get(idx).map(|info| &info.properties);
        }

        if (0..16).contains(&x) && (0..16).contains(&z) {
            let target_section_y = if y < 0 {
                self.section_ctx.section_y - 1
            } else if y >= 16 {
                self.section_ctx.section_y + 1
            } else {
                self.section_ctx.section_y
            };

            let local_y = if y < 0 {
                (y + 16) as usize
            } else if y >= 16 {
                (y - 16) as usize
            } else {
                y as usize
            };

            let min_y = self.section_ctx.ctx.neighborhood.center.min_y as i32;
            let s_idx = (target_section_y - min_y) as usize;
            if let Some(Some(props_vec)) = self.section_ctx.ctx.chunk_props_cache.get(s_idx) {
                if let Some(target_section) =
                    self.section_ctx.ctx.neighborhood.center.get_section(target_section_y as i8)
                {
                    let p_idx = target_section.get_block_palette_index(x as usize, local_y, z as usize);
                    if p_idx < props_vec.len() {
                        return Some(&props_vec[p_idx]);
                    }
                }
            }
        }

        None
    }

    /// 读取任意邻域位置的属性。
    /// 先查当前 chunk 内缓存，命中失败时再通过 blockstate id 向 manager 查询属性。
    pub fn props_at_any(&self, x: i32, y: i32, z: i32) -> Option<&CachedBlockProperties> {
        if let Some(props) = self.props_at_local(x, y, z) {
            return Some(props);
        }

        let id = self.state_id_at(x, y, z)?;
        self.section_ctx.ctx.manager.get_properties_by_id(id)
    }

    /// 读取任意邻域位置的 BlockState ID。
    pub fn state_id_at(&self, x: i32, y: i32, z: i32) -> Option<BlockId> {
        get_block_state_in_neighborhood(self.section_ctx.ctx.neighborhood, self.section_ctx.section_y, x, y, z)
    }
}