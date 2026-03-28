//! # 面剔除服务 (Culling Service)
//!
//! ## 职责
//! 把当前方块与邻居方块的属性组合成一次统一的可见性判定，复用底层 `should_cull_cached` 规则。

use crate::domain::block::CachedBlockProperties;
use crate::mesher::culling::{should_cull_cached, u8_to_render_layer};
use crate::mesher::types::CachedBlockInfo;

pub struct CullingService;

impl CullingService {
    /// 判断当前方向上的面是否应被邻居完全遮挡。
    /// 输入只依赖缓存属性，不需要重新解析模型结构。
    pub fn should_cull(
        current: &CachedBlockInfo,
        dir_idx: usize,
        neighbor: &CachedBlockProperties,
    ) -> bool {
        should_cull_cached(
            u8_to_render_layer(current.properties.render_layer),
            current.properties.block_key_id,
            dir_idx,
            neighbor,
            if dir_idx < 6 { current.properties.masks[dir_idx] } else { 0 },
            current.properties.masks16.as_ref(),
            current.properties.mask_res,
            current.properties.is_full_cube,
        )
    }
}