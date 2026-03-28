//! Smooth Lighting Logic
//!
//! 处理平滑光照 (AO) 的计算。

use crate::io::anvil::chunk::ChunkData;

use super::types::Neighborhood;

/// 获取压缩的光照值 (Lower/Higher Nibble)
pub(crate) fn nibble_at(data: &Vec<i8>, index: usize) -> u8 {
    if data.is_empty() { return 0; }
    let byte = data.get(index / 2).copied().unwrap_or(0) as u8;
    if index % 2 == 0 { byte & 0x0F } else { (byte >> 4) & 0x0F }
}

/// 获取特定坐标的光照值 (Block, Sky)
pub(crate) fn get_light_at(chunk: &ChunkData, section_y: i32, x: i32, y: i32, z: i32) -> (u8, u8) {
    if x < 0 || x >= 16 || z < 0 || z >= 16 { return (0, 15); }

    let mut target_section_y = section_y;
    let mut ly = y;
    if ly < 0 {
        target_section_y -= 1;
        ly += 16;
    } else if ly >= 16 {
        target_section_y += 1;
        ly -= 16;
    }

    let section = match chunk.get_section(target_section_y as i8) {
        Some(s) => s,
        None => return (0, 15),
    };

    let idx = (ly as usize) * 256 + (z as usize) * 16 + (x as usize);
    
    // Check for "Unlit Chunk" state:
    // If the section has block data (is not empty/air-only) BUT has no block light data,
    // it means the chunk is not fully lit yet (e.g. waiting for neighbors).
    // In this case, returning 0 is dangerous (causes black borders). 
    // We returns a sentinel or handle it in specific sampling logic?
    // 
    // Actually, simply relying on unwrap_or(0) IS the bug. 
    // But `get_light_at` signature returns specific values.
    // 
    // Strategy: We keep this low-level accessor simple. 
    // The "smart fallback" should be handled in `get_light_at_in_neighborhood` or by checking section state explicitly.
    // However, to do it cleanly without changing signatures everywhere, we can try to detect this "invalid state".
    
    let block = section.block_light.as_ref().map(|v| nibble_at(v, idx)).unwrap_or(0);
    let sky = section.sky_light.as_ref().map(|v| nibble_at(v, idx)).unwrap_or(15);
    (block, sky)
}

/// 在邻域中获取特定坐标的光照值
pub(crate) fn get_light_at_in_neighborhood(neighborhood: &Neighborhood, section_y: i32, x: i32, y: i32, z: i32) -> (u8, u8) {
    if x >= 0 && x < 16 && z >= 0 && z < 16 {
        return get_light_at(neighborhood.center, section_y, x, y, z);
    }

    // Helper to safely get light from neighbor.
    // Missing neighbor -> None; existing neighbor always samples directly.
    // NOTE: Missing BlockLight/SkyLight arrays are handled by `get_light_at` defaults
    // (block=0, sky=15), and chunk parse fallback handles initialize_light cases.
    let try_get_neighbor = |chunk_opt: Option<&ChunkData>, nx: i32, ny: i32, nz: i32| -> Option<(u8, u8)> {
        match chunk_opt {
            Some(c) => Some(get_light_at(c, section_y, nx, ny, nz)),
            None => None,
        }
    };

    if x < 0 {
        if z < 0 {
            if let Some(val) = try_get_neighbor(neighborhood.north_west, x + 16, y, z + 16) { return val; }
        } else if z >= 16 {
            if let Some(val) = try_get_neighbor(neighborhood.south_west, x + 16, y, z - 16) { return val; }
        } else {
            if let Some(val) = try_get_neighbor(neighborhood.west, x + 16, y, z) { return val; }
        }
    } else if x >= 16 { 
        if z < 0 {
            if let Some(val) = try_get_neighbor(neighborhood.north_east, x - 16, y, z + 16) { return val; }
        } else if z >= 16 {
            if let Some(val) = try_get_neighbor(neighborhood.south_east, x - 16, y, z - 16) { return val; }
        } else {
            if let Some(val) = try_get_neighbor(neighborhood.east, x - 16, y, z) { return val; }
        }
    } else if z < 0 {
        if let Some(val) = try_get_neighbor(neighborhood.north, x, y, z + 16) { return val; }
    } else if z >= 16 {
        if let Some(val) = try_get_neighbor(neighborhood.south, x, y, z - 16) { return val; }
    }

    // Fallback for missing or invalid neighbors.
    // Match the legacy behavior: clamp to the center chunk edge sample.
    // This avoids hard seams when diagonal neighbors are not available.
    let clamp_x = x.clamp(0, 15);
    let clamp_z = z.clamp(0, 15);
    get_light_at(neighborhood.center, section_y, clamp_x, y, clamp_z)
}

// use crate::domain::block::CachedBlockProperties;

// ...

/// 计算平滑光照 (Ambient Occlusion)
pub(crate) fn calculate_smooth_light(
    neighbor_access: &crate::mesher::services::neighbor::NeighborAccess,
    neighborhood: &Neighborhood,
    section_y: i32,
    x: i32,
    y: i32,
    z: i32,
    dir: usize,
    enable_vertex_ao: bool,
) -> [(f32, f32); 4] {

    let mut cx = x;
    let mut cy = y;
    let mut cz = z;
    match dir {
        0 => cy += 1, // Up
        1 => cy -= 1, // Down
        2 => cz -= 1, // North
        3 => cz += 1, // South
        4 => cx -= 1, // West
        5 => cx += 1, // East
        _ => {}
    }

    let center = get_light_at_in_neighborhood(neighborhood, section_y, cx, cy, cz);

    // Helper to check opacity
    let is_opaque = |nx, ny, nz| {
        if let Some(prop) = neighbor_access.props_at_any(nx, ny, nz) {
            prop.is_opaque_full_cube
        } else {
            false
        }
    };

    // Linear averaging to match 'ancient' (bak) behavior.
    // This produces a darker, higher-contrast smooth lighting look when combined with
    // the shader's gamma 2.2 curve (since pow(avg) < avg(pow)).
    let sample = |dx1: i32, dy1: i32, dz1: i32, dx2: i32, dy2: i32, dz2: i32, dx3: i32, dy3: i32, dz3: i32| -> (f32, f32) {
        let s1 = get_light_at_in_neighborhood(neighborhood, section_y, cx + dx1, cy + dy1, cz + dz1);
        let s2 = get_light_at_in_neighborhood(neighborhood, section_y, cx + dx2, cy + dy2, cz + dz2);
        let c = get_light_at_in_neighborhood(neighborhood, section_y, cx + dx3, cy + dy3, cz + dz3);

        let opaque1 = is_opaque(cx + dx1, cy + dy1, cz + dz1);
        let opaque2 = is_opaque(cx + dx2, cy + dy2, cz + dz2);
        let opaque_c = is_opaque(cx + dx3, cy + dy3, cz + dz3);

        // Calculate AO term
        // Logic: count opaque neighbors. 
        // Side1 & Side2 block light -> AO level 3 (max occlusion)
        // Side1 or Side2 block light -> AO level 1
        // Corner blocks light -> AO level 1 (accumulative)
        
        let mut ao_val = 0;
        if opaque1 && opaque2 {
            ao_val = 3;
        } else {
            if opaque1 { ao_val += 1; }
            if opaque2 { ao_val += 1; }
            if opaque_c { ao_val += 1; }
        }
        
        // Map ao_val (0..3) to factor.
        // Tweak: Reduced darkness to 0.7 for level 3 to brighten corners slightly.
        let ao_factor = if enable_vertex_ao {
            match ao_val {
                0 => 1.0,
                1 => 0.82, // Slightly brighter than 0.8
                2 => 0.65, // Brighter than 0.6
                3 => 0.5,  // Brighter than 0.4
                _ => 1.0,
            }
        } else {
            1.0
        };

        // Simple linear average of 4 samples (center + 2 sides + diagonal corner)
        // Values are normalized to 0.0-1.0 range (divided by 15.0)
        let b_avg = (((center.0 as f32) + (s1.0 as f32) + (s2.0 as f32) + (c.0 as f32)) / 4.0) * ao_factor;
        let s_avg = (((center.1 as f32) + (s1.1 as f32) + (s2.1 as f32) + (c.1 as f32)) / 4.0) * ao_factor;
        
        (b_avg / 15.0, s_avg / 15.0)
    };

    match dir {
        0 => [
            sample(-1, 0, 0, 0, 0, -1, -1, 0, -1),
            sample(1, 0, 0, 0, 0, -1, 1, 0, -1),
            sample(1, 0, 0, 0, 0, 1, 1, 0, 1),
            sample(-1, 0, 0, 0, 0, 1, -1, 0, 1),
        ],
        1 => [
            sample(-1, 0, 0, 0, 0, 1, -1, 0, 1),
            sample(1, 0, 0, 0, 0, 1, 1, 0, 1),
            sample(1, 0, 0, 0, 0, -1, 1, 0, -1),
            sample(-1, 0, 0, 0, 0, -1, -1, 0, -1),
        ],
        2 => [
            sample(1, 0, 0, 0, 1, 0, 1, 1, 0),
            sample(-1, 0, 0, 0, 1, 0, -1, 1, 0),
            sample(-1, 0, 0, 0, -1, 0, -1, -1, 0),
            sample(1, 0, 0, 0, -1, 0, 1, -1, 0),
        ],
        3 => [
            sample(-1, 0, 0, 0, 1, 0, -1, 1, 0),
            sample(1, 0, 0, 0, 1, 0, 1, 1, 0),
            sample(1, 0, 0, 0, -1, 0, 1, -1, 0),
            sample(-1, 0, 0, 0, -1, 0, -1, -1, 0),
        ],
        4 => [
            sample(0, 0, -1, 0, 1, 0, 0, 1, -1),
            sample(0, 0, 1, 0, 1, 0, 0, 1, 1),
            sample(0, 0, 1, 0, -1, 0, 0, -1, 1),
            sample(0, 0, -1, 0, -1, 0, 0, -1, -1),
        ],
        5 => [
            sample(0, 0, 1, 0, 1, 0, 0, 1, 1),
            sample(0, 0, -1, 0, 1, 0, 0, 1, -1),
            sample(0, 0, -1, 0, -1, 0, 0, -1, -1),
            sample(0, 0, 1, 0, -1, 0, 0, -1, 1),
        ],
        _ => [(1.0, 1.0); 4],
    }
}

/// Flat (non-smoothed) per-vertex lighting.
///
/// Returns the raw light sampled from the face-adjacent cell and replicates it to all 4 vertices.
/// This keeps the "vertex lighting" data path intact while disabling any extra smoothing work.
pub(crate) fn calculate_flat_light(
    neighborhood: &Neighborhood,
    section_y: i32,
    x: i32,
    y: i32,
    z: i32,
    dir: usize,
) -> [(f32, f32); 4] {
    let mut cx = x;
    let mut cy = y;
    let mut cz = z;
    match dir {
        0 => cy += 1, // Up
        1 => cy -= 1, // Down
        2 => cz -= 1, // North
        3 => cz += 1, // South
        4 => cx -= 1, // West
        5 => cx += 1, // East
        _ => {}
    }

    let (bl, sl) = get_light_at_in_neighborhood(neighborhood, section_y, cx, cy, cz);
    let b = (bl as f32) / 15.0;
    let s = (sl as f32) / 15.0;
    [(b, s), (b, s), (b, s), (b, s)]
}
