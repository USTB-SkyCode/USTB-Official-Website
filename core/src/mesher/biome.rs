//! # 生物群系染色采样 (Biome Tint Sampling)
//!
//! ## 职责
//! 为草、树叶、水等需要 biome tint 的材质提供跨 chunk 边界的平滑采样。
//!
//! ## MC 机制
//! 使用固定半径的邻域平均近似原版 biome blend，允许跨 3x3 chunk 邻域读取 2D biome 数据。

use crate::domain::biome::{get_biome_climate, BiomeId};
use crate::domain::block::{BlockId, BlockModelManager};
use crate::mesher::types::Neighborhood;

const BIOME_BLEND_RADIUS: i32 = 2;

#[inline]
/// 把整数限制在给定区间内。
fn clamp_i32(v: i32, min_v: i32, max_v: i32) -> i32 {
    if v < min_v {
        min_v
    } else if v > max_v {
        max_v
    } else {
        v
    }
}

/// 在 3x3 chunk 邻域中读取 `(x,z)` 对应的 biome id。
/// 若坐标越过中心 chunk，则切换到相应邻居 chunk，并把局部坐标折返到 0..15。
fn biome_id_at(neighborhood: &Neighborhood, x: i32, z: i32) -> BiomeId {
    let mut chunk = neighborhood.center;
    let mut lx = x;
    let mut lz = z;

    let mut override_chunk = None;

    if x < 0 {
        if z < 0 {
            override_chunk = neighborhood.north_west;
            lx += 16;
            lz += 16;
        } else if z >= 16 {
            override_chunk = neighborhood.south_west;
            lx += 16;
            lz -= 16;
        } else {
            override_chunk = neighborhood.west;
            lx += 16;
        }
    } else if x >= 16 {
        if z < 0 {
            override_chunk = neighborhood.north_east;
            lx -= 16;
            lz += 16;
        } else if z >= 16 {
            override_chunk = neighborhood.south_east;
            lx -= 16;
            lz -= 16;
        } else {
            override_chunk = neighborhood.east;
            lx -= 16;
        }
    } else if z < 0 {
        override_chunk = neighborhood.north;
        lz += 16;
    } else if z >= 16 {
        override_chunk = neighborhood.south;
        lz -= 16;
    }

    if let Some(c) = override_chunk {
        chunk = c;
    } else {
        lx = clamp_i32(lx, 0, 15);
        lz = clamp_i32(lz, 0, 15);
    }

    chunk.get_biome_2d(lx as usize, lz as usize)
}

#[inline]
/// 从 biome 水色构造线性空间 water tint。
fn water_tint_from_biome(biome_id: BiomeId) -> [f32; 3] {
    let biome = get_biome_climate(biome_id);
    let water_color = biome.water_color;
    let r = ((water_color >> 16) & 0xFF) as f32 / 255.0;
    let g = ((water_color >> 8) & 0xFF) as f32 / 255.0;
    let b = (water_color & 0xFF) as f32 / 255.0;
    [r * r, g * g, b * b]
}

/// 采样任意带 tintindex 的方块颜色。
/// 在 `BIOME_BLEND_RADIUS` 范围内做均值混合，减少 chunk 边界色带。
pub fn sample_biome_tint(
    neighborhood: &Neighborhood,
    manager: &BlockModelManager,
    block_id: BlockId,
    tint_index: i32,
    bx: i32,
    bz: i32,
) -> [f32; 3] {
    let mut acc = [0.0f32; 3];
    let mut count = 0.0f32;

    for dz in -BIOME_BLEND_RADIUS..=BIOME_BLEND_RADIUS {
        for dx in -BIOME_BLEND_RADIUS..=BIOME_BLEND_RADIUS {
            let biome_id = biome_id_at(neighborhood, bx + dx, bz + dz);
            let c = manager.get_tint(block_id, tint_index, biome_id);
            acc[0] += c[0];
            acc[1] += c[1];
            acc[2] += c[2];
            count += 1.0;
        }
    }

    if count > 0.0 {
        [acc[0] / count, acc[1] / count, acc[2] / count]
    } else {
        let biome_id = biome_id_at(neighborhood, bx, bz);
        manager.get_tint(block_id, tint_index, biome_id)
    }
}

/// 采样水体颜色。
/// 若 registry 中存在 water block，则复用 manager 的 tint；否则退回 biome 自带水色。
pub fn sample_water_tint(
    neighborhood: &Neighborhood,
    manager: &BlockModelManager,
    bx: i32,
    bz: i32,
) -> [f32; 3] {
    let water_id = manager.lookup_simple_id("water");
    let mut acc = [0.0f32; 3];
    let mut count = 0.0f32;

    for dz in -BIOME_BLEND_RADIUS..=BIOME_BLEND_RADIUS {
        for dx in -BIOME_BLEND_RADIUS..=BIOME_BLEND_RADIUS {
            let biome_id = biome_id_at(neighborhood, bx + dx, bz + dz);
            let c = if let Some(id) = water_id {
                manager.get_tint(id, 0, biome_id)
            } else {
                water_tint_from_biome(biome_id)
            };
            acc[0] += c[0];
            acc[1] += c[1];
            acc[2] += c[2];
            count += 1.0;
        }
    }

    if count > 0.0 {
        [acc[0] / count, acc[1] / count, acc[2] / count]
    } else {
        let biome_id = biome_id_at(neighborhood, bx, bz);
        if let Some(id) = water_id {
            manager.get_tint(id, 0, biome_id)
        } else {
            water_tint_from_biome(biome_id)
        }
    }
}
