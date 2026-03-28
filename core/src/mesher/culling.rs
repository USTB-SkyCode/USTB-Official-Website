//! Face Culling Logic
//!
//! 处理方块面剔除逻辑，基于渲染层与体素覆盖掩码。

use crate::io::anvil::chunk::ChunkData;
use crate::domain::block::CachedBlockProperties;

use super::types::{Neighborhood, RenderLayer};

/// 将 u8 转换为 RenderLayer 枚举
pub(crate) fn u8_to_render_layer(layer: u8) -> RenderLayer {
    match layer {
        0 => RenderLayer::Solid,
        1 => RenderLayer::Cutout,
        2 => RenderLayer::CutoutMipped,
        3 => RenderLayer::Translucent,
        _ => RenderLayer::Solid,
    }
}

/// 基于邻居方块属性判断是否剔除当前面
pub(crate) fn should_cull_cached(
    cur_layer: RenderLayer, 
    current_block_key_id: u32,
    dir_idx: usize, 
    neighbor: &CachedBlockProperties,
    current_mask: u64,
    current_masks16: Option<&[u64; 24]>,
    current_mask_res: u8,
    current_is_full_cube: bool,
) -> bool {
    if neighbor.is_air {
        return false;
    }
    let neigh_layer = u8_to_render_layer(neighbor.render_layer);

    // Rule: CutoutMipped (Layer 2) often implies complex partial transparency (e.g. Leaves) 
    // where culling neighbors might look wrong or cause issues. 
    // Cutout (Layer 1) is usually binary alpha (Grass), which SHOULD cull neighbors.
    if neigh_layer == RenderLayer::CutoutMipped {
        return false;
    }

    // Compat check helper
    let is_compatible = |n_layer: RenderLayer| -> bool {
        if n_layer == RenderLayer::Solid {
            return true;
        }

        let names_match = current_block_key_id != 0 && current_block_key_id == neighbor.block_key_id;

        // Cutout only culls when same layer + same block.
        if cur_layer == RenderLayer::Cutout && n_layer == RenderLayer::Cutout && names_match {
            return true;
        }

        if cur_layer == RenderLayer::Translucent && n_layer == RenderLayer::Translucent && names_match {
            return true;
        }
        false
    };

    // 1. Full-cube fast path
    if current_is_full_cube && neighbor.is_full_cube {
        if is_compatible(neigh_layer) { return true; }
    }

    // 2. Precise Mask Check
    if current_mask != 0 || current_mask_res != 0 {
        let oppos = dir_idx ^ 1;
        let neigh_mask = if oppos < 6 { neighbor.masks[oppos] } else { 0 };

        if mask_fully_covered(
            dir_idx,
            current_mask,
            current_masks16,
            current_mask_res,
            neigh_mask,
            neighbor.masks16.as_ref(),
            neighbor.mask_res,
        ) {
            if is_compatible(neigh_layer) { return true; }
        }
    }

    false
}

fn mask_fully_covered(
    dir_idx: usize,
    current_mask: u64,
    current_masks16: Option<&[u64; 24]>,
    current_mask_res: u8,
    neigh_mask: u64,
    neigh_masks16: Option<&[u64; 24]>,
    neigh_mask_res: u8,
) -> bool {
    let face_bit = 1u8 << dir_idx;
    let current_is_16 = (current_mask_res & face_bit) != 0;
    let neigh_is_16 = (neigh_mask_res & (1u8 << (dir_idx ^ 1))) != 0;

    if current_is_16 || neigh_is_16 {
        let cur16 = if current_is_16 {
            current_masks16.map(|m| face_masks16(m, dir_idx)).unwrap_or([0u64; 4])
        } else {
            upsample_mask8_to_16(current_mask)
        };

        let neigh16 = if neigh_is_16 {
            neigh_masks16.map(|m| face_masks16(m, dir_idx ^ 1)).unwrap_or([0u64; 4])
        } else {
            upsample_mask8_to_16(neigh_mask)
        };

        for i in 0..4 {
            if (cur16[i] & !neigh16[i]) != 0 {
                return false;
            }
        }
        return true;
    }

    (current_mask & !neigh_mask) == 0
}

fn face_masks16(masks16: &[u64; 24], face: usize) -> [u64; 4] {
    let idx = face * 4;
    [masks16[idx], masks16[idx + 1], masks16[idx + 2], masks16[idx + 3]]
}

fn upsample_mask8_to_16(mask8: u64) -> [u64; 4] {
    let mut out = [0u64; 4];
    for row in 0..8 {
        for col in 0..8 {
            let bit = 1u64 << (row * 8 + col);
            if (mask8 & bit) == 0 { continue; }
            let base_row = row * 2;
            let base_col = col * 2;
            for dr in 0..2 {
                for dc in 0..2 {
                    let r = base_row + dr;
                    let c = base_col + dc;
                    let tile = (r / 8) * 2 + (c / 8);
                    let idx = (r % 8) * 8 + (c % 8);
                    out[tile] |= 1u64 << idx;
                }
            }
        }
    }
    out
}


/// 获取特定位置的 BlockId
pub(crate) fn get_block_state(chunk: &ChunkData, section_y: i32, x: i32, y: i32, z: i32) -> Option<crate::domain::block::BlockId> {
    if x < 0 || x >= 16 || z < 0 || z >= 16 { return None; }
    let mut target_section_y = section_y;
    let mut ly = y;
    if ly < 0 {
        target_section_y -= 1;
        ly += 16;
    } else if ly >= 16 {
        target_section_y += 1;
        ly -= 16;
    }
    let section = chunk.get_section(target_section_y as i8)?;
    section.get_block_state(x as usize, ly as usize, z as usize)
}

/// 在邻域中获取特定位置的 BlockId
pub(crate) fn get_block_state_in_neighborhood(neighborhood: &Neighborhood, section_y: i32, x: i32, y: i32, z: i32) -> Option<crate::domain::block::BlockId> {
    if x >= 0 && x < 16 && z >= 0 && z < 16 {
        return get_block_state(neighborhood.center, section_y, x, y, z);
    }

    if x < 0 {
        if z < 0 {
            if let Some(nw) = neighborhood.north_west { return get_block_state(nw, section_y, x + 16, y, z + 16); }
        } else if z >= 16 {
            if let Some(sw) = neighborhood.south_west { return get_block_state(sw, section_y, x + 16, y, z - 16); }
        } else if let Some(west) = neighborhood.west { return get_block_state(west, section_y, x + 16, y, z); }
    } else if x >= 16 {
        if z < 0 {
            if let Some(ne) = neighborhood.north_east { return get_block_state(ne, section_y, x - 16, y, z + 16); }
        } else if z >= 16 {
            if let Some(se) = neighborhood.south_east { return get_block_state(se, section_y, x - 16, y, z - 16); }
        } else if let Some(east) = neighborhood.east { return get_block_state(east, section_y, x - 16, y, z); }
    } else if z < 0 {
        if let Some(north) = neighborhood.north { return get_block_state(north, section_y, x, y, z + 16); }
    } else if z >= 16 {
        if let Some(south) = neighborhood.south { return get_block_state(south, section_y, x, y, z - 16); }
    }

    None
}
