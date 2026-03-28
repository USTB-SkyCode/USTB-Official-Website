//! # 流体网格生成模块 (Fluid Mesher)
//!
//! ## 职责
//! 以程序化方式生成 water / lava 的几何，不依赖静态 block model。
//!
//! ## MC 机制
//! 该实现近似对齐 Minecraft Java `FluidRenderer`：
//! - 水面高度由 level 与邻接采样共同决定。
//! - 顶面/侧面是否可见取决于相邻流体和遮挡方块。
//! - UV 会做轻微 inward shrink，降低纹理 bleeding。

use crate::domain::block::{BlockId, BlockModelManager, CachedBlockProperties, FACE_DOWN, FACE_EAST, FACE_NORTH, FACE_SOUTH, FACE_UP, FACE_WEST};
use crate::mesher::culling::get_block_state_in_neighborhood;
use crate::mesher::encoding::TerrainCompactEncoder;
use crate::mesher::lighting::{calculate_flat_light, calculate_smooth_light};
use crate::mesher::semantic::VertexSemantic;
use crate::mesher::services::neighbor::NeighborAccess;
use crate::mesher::biome;
use crate::mesher::types::{CachedBlockInfo, MesherOptions, Neighborhood};

// 纹理索引通过 `crate::config` 在运行时配置。

// Java 常量：静态液面高度约为 8/9 方块。
const FLUID_HEIGHT: f32 = 8.0 / 9.0;

// Java 会把 UV 向内收一点避免 bleeding。
// 这里按量化后的 ~1 texel 做近似收缩。
const UV_SCALE_DELTA: f32 = 1.0 / 1024.0;

const ALL_FACES: i32 = FACE_UP | FACE_DOWN | FACE_NORTH | FACE_SOUTH | FACE_WEST | FACE_EAST;

#[inline]
fn lerp(t: f32, a: f32, b: f32) -> f32 {
    a + t * (b - a)
}

#[inline]
fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

#[inline]
fn shade_factor(dir: Dir) -> f32 {
    // 对齐原版常见的无 AO 方向性明暗系数。
    match dir {
        Dir::Up => 1.0,
        Dir::Down => 0.5,
        Dir::North | Dir::South => 0.8,
        Dir::West | Dir::East => 0.6,
    }
}

#[inline]
fn apply_shade(rgb: (u32, u32, u32), s: f32) -> (u32, u32, u32) {
    let (r, g, b) = rgb;
    (
        ((r as f32) * s).round().clamp(0.0, 255.0) as u32,
        ((g as f32) * s).round().clamp(0.0, 255.0) as u32,
        ((b as f32) * s).round().clamp(0.0, 255.0) as u32,
    )
}

#[inline]
fn is_fluid_name(name: &str) -> bool {
    name == "water" || name == "lava"
}


#[inline]
fn same_fluid(manager: &BlockModelManager, id: BlockId, fluid_name: &str) -> bool {
    let Some(props) = manager.get_properties_by_id(id) else {
        return false;
    };

    if fluid_name == "water" {
        return props.is_water_filled;
    }
    if fluid_name == "lava" {
        return props.is_lava;
    }

    // 兜底到名字完全匹配。
    props.name.as_str() == fluid_name
}

fn is_water_filled_state(manager: &BlockModelManager, id: BlockId) -> bool {
    if let Some(props) = manager.get_properties_by_id(id) {
        return props.is_water_filled;
    }
    false
}

fn get_level(manager: &BlockModelManager, id: BlockId) -> u8 {
    let pid = match manager.lookup_prop_id("level") {
        Some(v) => v,
        None => return 0,
    };

    let states = manager.get_block_states_registry();
    let state = match states.get(id as usize) {
        Some(s) => s,
        None => return 0,
    };

    for (k, v) in state {
        if *k == pid {
            return manager.with_value_str(*v, |s| s.parse::<u8>().ok()).unwrap_or(0);
        }
    }

    0
}

#[inline]
fn height_from_level(level: u8) -> f32 {
    // 近似原版：level 0 -> 8/9，level 7 -> 1/9，falling(>=8) 视作满格。
    if level >= 8 {
        return 1.0;
    }
    let l = (level % 8) as f32;
    ((8.0 - l) / 9.0).clamp(0.0, 1.0)
}

#[inline]
fn is_full_cube(props: &CachedBlockProperties) -> bool {
    !props.is_air && (props.cull_mask & ALL_FACES) == ALL_FACES
}

fn is_solid_for_fluid_height(manager: &BlockModelManager, id: BlockId) -> bool {
    // 当前没有 Java 那种完整 voxel-shape，使用 full-cube cull mask 近似固体判定。
    let Some(props) = manager.get_properties_by_id(id) else { return false; };
    is_full_cube(props)
}

#[derive(Clone, Copy)]
enum Dir {
    Up,
    Down,
    North,
    South,
    West,
    East,
}

impl Dir {
    #[inline]
    /// 返回方向对应的面法线。
    fn normal(self) -> [f32; 3] {
        match self {
            Dir::Up => [0.0, 1.0, 0.0],
            Dir::Down => [0.0, -1.0, 0.0],
            Dir::North => [0.0, 0.0, -1.0],
            Dir::South => [0.0, 0.0, 1.0],
            Dir::West => [-1.0, 0.0, 0.0],
            Dir::East => [1.0, 0.0, 0.0],
        }
    }
}

#[derive(Clone, Copy)]
struct FluidNeighbors {
    above: Option<BlockId>,
    below: Option<BlockId>,
    north: Option<BlockId>,
    south: Option<BlockId>,
    west: Option<BlockId>,
    east: Option<BlockId>,
}

impl FluidNeighbors {
    #[inline]
    fn get(&self, dir: Dir) -> Option<BlockId> {
        match dir {
            Dir::Up => self.above,
            Dir::Down => self.below,
            Dir::North => self.north,
            Dir::South => self.south,
            Dir::West => self.west,
            Dir::East => self.east,
        }
    }
}

fn sample_neighbors(
    neighborhood: &Neighborhood,
    section_y: i32,
    bx: i32,
    by: i32,
    bz: i32,
) -> FluidNeighbors {
    FluidNeighbors {
        above: get_block_state_in_neighborhood(neighborhood, section_y, bx, by + 1, bz),
        below: get_block_state_in_neighborhood(neighborhood, section_y, bx, by - 1, bz),
        north: get_block_state_in_neighborhood(neighborhood, section_y, bx, by, bz - 1),
        south: get_block_state_in_neighborhood(neighborhood, section_y, bx, by, bz + 1),
        west: get_block_state_in_neighborhood(neighborhood, section_y, bx - 1, by, bz),
        east: get_block_state_in_neighborhood(neighborhood, section_y, bx + 1, by, bz),
    }
}

/// 判断六向邻居是否全为同种流体。
fn all_neighbors_same_fluid(
    manager: &BlockModelManager,
    neighbors: &FluidNeighbors,
    fluid_name: &str,
) -> bool {
    matches!(neighbors.above, Some(id) if same_fluid(manager, id, fluid_name))
        && matches!(neighbors.below, Some(id) if same_fluid(manager, id, fluid_name))
        && matches!(neighbors.north, Some(id) if same_fluid(manager, id, fluid_name))
        && matches!(neighbors.south, Some(id) if same_fluid(manager, id, fluid_name))
        && matches!(neighbors.west, Some(id) if same_fluid(manager, id, fluid_name))
        && matches!(neighbors.east, Some(id) if same_fluid(manager, id, fluid_name))
}

#[inline]
fn required_bit_for_neighbor_face(dir: Dir) -> i32 {
    // 与 `should_cull_cached` 使用同一方向到 face bit 的映射。
    match dir {
        Dir::Up => FACE_DOWN,
        Dir::Down => FACE_UP,
        Dir::North => FACE_SOUTH,
        Dir::South => FACE_NORTH,
        Dir::West => FACE_EAST,
        Dir::East => FACE_WEST,
    }
}

fn is_side_covered(manager: &BlockModelManager, neighbor_id: BlockId, side: Dir, height: f32) -> bool {
    // 原版会读取邻居 voxel-shape；这里用 cull_mask 做近似。
    let Some(props) = manager.get_properties_by_id(neighbor_id) else { return false; };
    let required_bit = required_bit_for_neighbor_face(side);
    if required_bit == 0 || (props.cull_mask & required_bit) == 0 {
        return false;
    }

    // full cube 的顶面仅在流体高度满格时完全遮挡。
    if is_full_cube(props) {
        if matches!(side, Dir::Up) {
            return (height - 1.0).abs() < 1.0e-6;
        }
        return true;
    }

    // 对部分方块采取保守策略：声明可遮挡即视为遮挡。
    true
}

#[inline]
fn should_skip_rendering(manager: &BlockModelManager, side: Dir, height: f32, neighbor_id: BlockId) -> bool {
    if !is_side_covered(manager, neighbor_id, side, height) {
        return false;
    }

    // cutout / translucent 邻居仍允许渲染水 overlay，例如玻璃侧面贴水。
    if let Some(props) = manager.get_properties_by_id(neighbor_id) {
        let l = props.render_layer;
        // Don't skip rendering against cutout/translucent blocks (leaves, glass, etc.)
        // so we can render the water overlay.
        if l == crate::domain::block::registry::LAYER_CUTOUT || 
           l == crate::domain::block::registry::LAYER_CUTOUT_MIPPED || 
           l == crate::domain::block::registry::LAYER_TRANSLUCENT {
            return false;
        }
    }

    true
}

fn fluid_height_at(
    manager: &BlockModelManager,
    neighborhood: &Neighborhood,
    section_y: i32,
    x: i32,
    y: i32,
    z: i32,
    fluid_name: &str,
) -> f32 {
    // 近似原版规则：
    // same fluid -> (above same fluid ? 1 : current height)
    // not same fluid -> solid ? -1 : 0
    let Some(id) = get_block_state_in_neighborhood(neighborhood, section_y, x, y, z) else {
        return 0.0;
    };

    if same_fluid(manager, id, fluid_name) {
        if let Some(above_id) = get_block_state_in_neighborhood(neighborhood, section_y, x, y + 1, z) {
            if same_fluid(manager, above_id, fluid_name) {
                return 1.0;
            }
        }

        // waterlogged 或水生植物等“含水但非纯水”状态按静态液面高度处理。
        if fluid_name == "water" {
            if let Some(props) = manager.get_properties_by_id(id) {
                if props.is_water_filled && props.name.as_str() != "water" {
                    return FLUID_HEIGHT;
                }
            }
        }

        return height_from_level(get_level(manager, id));
    }

    if is_solid_for_fluid_height(manager, id) {
        -1.0
    } else {
        0.0
    }
}

fn add_height(weighted: &mut [f32; 2], h: f32) {
    // 原版近似：高度 >= 0.8 的样本赋更高权重。
    if h >= 0.8 {
        weighted[0] += h * 10.0;
        weighted[1] += 10.0;
    } else if h >= 0.0 {
        weighted[0] += h;
        weighted[1] += 1.0;
    }
}

fn calculate_fluid_corner_height(
    manager: &BlockModelManager,
    neighborhood: &Neighborhood,
    section_y: i32,
    fluid_name: &str,
    origin_height: f32,
    north_south_height: f32,
    east_west_height: f32,
    diag_x: i32,
    diag_y: i32,
    diag_z: i32,
) -> f32 {
    // 角点高度由 origin/ns/ew/diag 四个样本做加权平均。
    if east_west_height >= 1.0 || north_south_height >= 1.0 {
        return 1.0;
    }

    let mut weighted = [0.0f32, 0.0f32];

    if east_west_height > 0.0 || north_south_height > 0.0 {
        let f = fluid_height_at(manager, neighborhood, section_y, diag_x, diag_y, diag_z, fluid_name);
        if f >= 1.0 {
            return 1.0;
        }
        add_height(&mut weighted, f);
    }

    add_height(&mut weighted, origin_height);
    add_height(&mut weighted, east_west_height);
    add_height(&mut weighted, north_south_height);

    if weighted[1] <= 0.0 {
        0.0
    } else {
        (weighted[0] / weighted[1]).clamp(0.0, 1.0)
    }
}

fn velocity_sample_height(
    manager: &BlockModelManager,
    neighborhood: &Neighborhood,
    section_y: i32,
    x: i32,
    y: i32,
    z: i32,
    fluid_name: &str,
    center_height: f32,
) -> f32 {
    // IMPORTANT:
    // Using `fluid_height_at` directly for flow inference is wrong around solid blocks because
    // it returns -1.0 for solid columns (Java uses `blockState.isSolid()` for *height smoothing*,
    // but velocity comes from the simulated FluidState). That -1 creates artificial gradients,
    // making still water look like flowing.
    //
    // We want:
    // - same fluid => its surface height
    // - air / non-solid => 0 (causes outward flow at edges)
    // - solid => center height (no gradient caused by walls)
    let Some(id) = get_block_state_in_neighborhood(neighborhood, section_y, x, y, z) else {
        return center_height;
    };

    if same_fluid(manager, id, fluid_name) {
        return fluid_height_at(manager, neighborhood, section_y, x, y, z, fluid_name);
    }

    if is_solid_for_fluid_height(manager, id) {
        center_height
    } else {
        0.0
    }
}

fn flow_velocity_xz(
    manager: &BlockModelManager,
    neighborhood: &Neighborhood,
    section_y: i32,
    bx: i32,
    by: i32,
    bz: i32,
    fluid_name: &str,
    center_height: f32,
) -> (f32, f32) {
    // Approximate Java's fluid velocity direction with negative height gradient.
    let h_w = velocity_sample_height(manager, neighborhood, section_y, bx - 1, by, bz, fluid_name, center_height);
    let h_e = velocity_sample_height(manager, neighborhood, section_y, bx + 1, by, bz, fluid_name, center_height);
    let h_n = velocity_sample_height(manager, neighborhood, section_y, bx, by, bz - 1, fluid_name, center_height);
    let h_s = velocity_sample_height(manager, neighborhood, section_y, bx, by, bz + 1, fluid_name, center_height);
    (h_w - h_e, h_n - h_s)
}

fn should_render_face_against_neighbor(
    manager: &BlockModelManager,
    fluid_name: &str,
    dir: Dir,
    height_for_skip_test: f32,
    neighbor_id: Option<BlockId>,
) -> bool {
    let Some(nid) = neighbor_id else {
        // Missing neighbor chunk: render conservatively.
        return true;
    };

    // Java: skip if same fluid.
    if same_fluid(manager, nid, fluid_name) {
        return false;
    }

    // Java: skip if neighbor covers the face for the relevant height.
    if should_skip_rendering(manager, dir, height_for_skip_test, nid) {
        return false;
    }

    true
}

#[allow(clippy::too_many_arguments)]
fn push_packed_quad(
    buffer: &mut Vec<u8>,
    indices: &mut Vec<u32>,
    neighborhood: &Neighborhood,
    neighbor_access: &NeighborAccess,
    section_y: i32,
    bx: i32,
    by: i32,
    bz: i32,
    block_x: f32,
    block_y: f32,
    block_z: f32,
    normal: [f32; 3],
    vx: [f32; 4],
    vy: [f32; 4],
    vz: [f32; 4],
    uvs: [[f32; 2]; 4],
    texture_id: u32,
    rgb: (u32, u32, u32),
    emission_value: f32,
    material_id: u32,
    options: MesherOptions,
) {
    let light_dir = crate::utils::closest_axis(normal);
    let lights = if options.vertex_lighting {
        if options.smooth_lighting {
            calculate_smooth_light(
                neighbor_access,
                neighborhood,
                section_y,
                bx,
                by,
                bz,
                light_dir,
                options.vertex_ao,
            )
        } else {
            calculate_flat_light(neighborhood, section_y, bx, by, bz, light_dir)
        }
    } else {
        [(0.0, 1.0); 4]
    };

    let (r, g, b) = rgb;
    let emission = emission_value.clamp(0.0, 1.0);

    let mut packed_vertices = [[0u8; TerrainCompactEncoder::VERTEX_STRIDE_BYTES]; 4];

    for idx in 0..4 {
        // Per-corner light selection follows the same heuristic as quads.rs.
        let (bl, sl) = match light_dir {
            0 => {
                let is_east = vx[idx] > 0.5;
                let is_south = vz[idx] > 0.5;
                match (is_east, is_south) {
                    (false, false) => lights[0],
                    (true, false) => lights[1],
                    (true, true) => lights[2],
                    (false, true) => lights[3],
                }
            }
            1 => {
                let is_east = vx[idx] > 0.5;
                let is_south = vz[idx] > 0.5;
                match (is_east, is_south) {
                    (false, true) => lights[0],
                    (true, true) => lights[1],
                    (true, false) => lights[2],
                    (false, false) => lights[3],
                }
            }
            2 => {
                let is_east = vx[idx] > 0.5;
                let is_up = vy[idx] > 0.5;
                match (is_east, is_up) {
                    (true, true) => lights[0],
                    (false, true) => lights[1],
                    (false, false) => lights[2],
                    (true, false) => lights[3],
                }
            }
            3 => {
                let is_east = vx[idx] > 0.5;
                let is_up = vy[idx] > 0.5;
                match (is_east, is_up) {
                    (false, true) => lights[0],
                    (true, true) => lights[1],
                    (true, false) => lights[2],
                    (false, false) => lights[3],
                }
            }
            4 => {
                let is_south = vz[idx] > 0.5;
                let is_up = vy[idx] > 0.5;
                match (is_south, is_up) {
                    (false, true) => lights[0],
                    (true, true) => lights[1],
                    (true, false) => lights[2],
                    (false, false) => lights[3],
                }
            }
            5 => {
                let is_south = vz[idx] > 0.5;
                let is_up = vy[idx] > 0.5;
                match (is_south, is_up) {
                    (true, true) => lights[0],
                    (false, true) => lights[1],
                    (false, false) => lights[2],
                    (true, false) => lights[3],
                }
            }
            _ => lights[idx],
        };

        let semantic = VertexSemantic {
            position: [vx[idx] + block_x, vy[idx] + block_y, vz[idx] + block_z],
            normal,
            uv0: uvs[idx],
            color0: [
                (r as f32 / 255.0).clamp(0.0, 1.0),
                (g as f32 / 255.0).clamp(0.0, 1.0),
                (b as f32 / 255.0).clamp(0.0, 1.0),
                emission,
            ],
            block_light: bl,
            sky_light: sl,
            texture_index: texture_id as i32,
            material_id: material_id as u8,
            extra_u32: 0,
        };

        packed_vertices[idx] = TerrainCompactEncoder::encode_vertex_bytes(&semantic);
    }

    let start_index = (buffer.len() / TerrainCompactEncoder::VERTEX_STRIDE_BYTES) as u32;
    buffer.reserve(TerrainCompactEncoder::VERTEX_STRIDE_BYTES * 4);
    for v in &packed_vertices {
        buffer.extend_from_slice(v);
    }

    // WebGL2 defaults to CCW as front-face.
    // Fluid quads can be deformed (different corner heights), so relying on
    // hard-coded winding per call-site is fragile. Instead, infer the winding
    // from the first triangle's geometric normal and flip indices when needed
    // so the final winding matches `normal`.
    let p0 = [vx[0] + block_x, vy[0] + block_y, vz[0] + block_z];
    let p1 = [vx[1] + block_x, vy[1] + block_y, vz[1] + block_z];
    let p2 = [vx[2] + block_x, vy[2] + block_y, vz[2] + block_z];
    let e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    let e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    let tri_n = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
    ];
    let dot = tri_n[0] * normal[0] + tri_n[1] * normal[1] + tri_n[2] * normal[2];

    // Fluid vertex order differs from terrain quads, so CCW/flipped are defined locally.
    // Standard terrain uses QUAD_INDICES_CCW = [0,2,1,0,3,2] — see encoding/mod.rs.
    let indices_ccw = [0u32, 1u32, 2u32, 0u32, 2u32, 3u32];
    let indices_flipped = [0u32, 2u32, 1u32, 0u32, 3u32, 2u32];
    let indices_order: &[u32; 6] = if dot >= 0.0 { &indices_ccw } else { &indices_flipped };

    indices.reserve(6);
    for &i in indices_order {
        indices.push(start_index + i);
    }
}

/// Procedurally render a fluid block (water/lava) into the translucent buffers.
///
/// Returns true when it handled the block (even if it generated no faces).
pub fn mesh_fluid_block(
    translucent: &mut Vec<u8>,
    translucent_indices: &mut Vec<u32>,
    manager: &BlockModelManager,
    neighborhood: &Neighborhood,
    neighbor_access: &NeighborAccess,
    section_y: i32,
    bx: i32,
    by: i32,
    bz: i32,
    global_y: f32,
    info: &CachedBlockInfo,
    options: MesherOptions,
) -> bool {
    let name = info.properties.name.as_str();
    let fluid_name = if is_fluid_name(name) {
        name
    } else if same_fluid(manager, info.id, "water") {
        "water"
    } else {
        return false;
    };

    // Water-filled blocks (waterlogged or aquatic plants): render an additional *static* full
    // water block in this cell.
    // (The block's own model is still meshed separately.)
    let force_still = fluid_name == "water" && is_water_filled_state(manager, info.id) && name != "water";

    let is_lava = fluid_name == "lava";
    let water_still_tex = crate::config::get_water_still_tex();
    let water_flow_tex = crate::config::get_water_flow_tex();
    let lava_still_tex = crate::config::get_lava_still_tex();
    let lava_flow_tex = crate::config::get_lava_flow_tex();
    let still_tex = if is_lava { lava_still_tex } else { water_still_tex };
    let flow_tex = if is_lava { lava_flow_tex } else { water_flow_tex };

    // Biome tint / material source:
    // - Lava: always white
    // - Water: MUST be tinted like the actual water block, even when rendering water from a
    //   water-filled state (waterlogged or aquatic plants).
    //   NOTE: because this project registers blocks on-demand, the "water" block might not be
    //   registered yet when meshing e.g. seagrass-only chunks. In that case, DO NOT fall back
    //   to the host block's tint (seagrass is grass-tinted). Use vanilla water tint directly.
    let base_rgb = if is_lava {
        (255u32, 255u32, 255u32)
    } else {
        let tint = biome::sample_water_tint(neighborhood, manager, bx, bz);
        (
            (tint[0].clamp(0.0, 1.0) * 255.0) as u32,
            (tint[1].clamp(0.0, 1.0) * 255.0) as u32,
            (tint[2].clamp(0.0, 1.0) * 255.0) as u32,
        )
    };

    // Coordinates are chunk-local block origins.
    let block_x = bx as f32;
    let block_y = global_y;
    let block_z = bz as f32;

    let material_id = if is_lava {
        (manager
            .get_properties_by_id(info.id)
            .map(|p| p.translucent_material_id)
            .unwrap_or(info.properties.translucent_material_id) as u32)
            & 0xF
    } else {
        // Water's translucent material bucket.
        0u32
    };

    let neighbors = sample_neighbors(neighborhood, section_y, bx, by, bz);
    if all_neighbors_same_fluid(manager, &neighbors, fluid_name) {
        return true;
    }

    // Neighbor ids used for skip tests.
    let above_id = neighbors.above;
    let below_id = neighbors.below;

    // Java naming:
    // n = center height
    // p = NW, o = NE, q = SE, r = SW
    let n = fluid_height_at(manager, neighborhood, section_y, bx, by, bz, fluid_name);

    let (p, o, q, r) = if n >= 1.0 {
        (1.0, 1.0, 1.0, 1.0)
    } else {
        let h_n = fluid_height_at(manager, neighborhood, section_y, bx, by, bz - 1, fluid_name);
        let h_s = fluid_height_at(manager, neighborhood, section_y, bx, by, bz + 1, fluid_name);
        let h_e = fluid_height_at(manager, neighborhood, section_y, bx + 1, by, bz, fluid_name);
        let h_w = fluid_height_at(manager, neighborhood, section_y, bx - 1, by, bz, fluid_name);

        // Diagonal positions correspond to the corner.
        let o_ne = calculate_fluid_corner_height(manager, neighborhood, section_y, fluid_name, n, h_n, h_e, bx + 1, by, bz - 1);
        let p_nw = calculate_fluid_corner_height(manager, neighborhood, section_y, fluid_name, n, h_n, h_w, bx - 1, by, bz - 1);
        let q_se = calculate_fluid_corner_height(manager, neighborhood, section_y, fluid_name, n, h_s, h_e, bx + 1, by, bz + 1);
        let r_sw = calculate_fluid_corner_height(manager, neighborhood, section_y, fluid_name, n, h_s, h_w, bx - 1, by, bz + 1);

        (p_nw, o_ne, q_se, r_sw)
    };

    let min_top_height = p.min(o).min(q).min(r);
    let max_top_height_ns = p.max(o).max(q).max(r);

    // Face visibility. In Java these are split between shouldRenderSide and shouldSkipRendering.
    // Here we fold both checks into one helper.
    let render_up = if let Some(aid) = above_id {
        !same_fluid(manager, aid, fluid_name) && !should_skip_rendering(manager, Dir::Up, min_top_height, aid)
    } else {
        true
    };

    let render_down = if let Some(bid) = below_id {
        !same_fluid(manager, bid, fluid_name) && !should_skip_rendering(manager, Dir::Down, FLUID_HEIGHT, bid)
    } else {
        true
    };

    let render_north = should_render_face_against_neighbor(
        manager,
        fluid_name,
        Dir::North,
        max_top_height_ns,
        neighbors.north,
    );
    let render_south = should_render_face_against_neighbor(
        manager,
        fluid_name,
        Dir::South,
        max_top_height_ns,
        neighbors.south,
    );
    let render_west = should_render_face_against_neighbor(
        manager,
        fluid_name,
        Dir::West,
        max_top_height_ns,
        neighbors.west,
    );
    let render_east = should_render_face_against_neighbor(
        manager,
        fluid_name,
        Dir::East,
        max_top_height_ns,
        neighbors.east,
    );

    if !(render_up || render_down || render_north || render_south || render_west || render_east) {
        return true;
    }

    // Epsilon offsets match Java: v=0.001, and w depends on bottom rendering.
    let eps = 0.001f32;
    let w = if render_down { eps } else { 0.0 };

    // TOP
    if render_up {
        // Flow direction controls top UV selection.
        let (has_flow, flow_angle, top_texture) = if force_still {
            (false, 0.0, still_tex)
        } else {
            let (vel_x, vel_z) =
                flow_velocity_xz(manager, neighborhood, section_y, bx, by, bz, fluid_name, n);
            let vel_len2 = vel_x * vel_x + vel_z * vel_z;
            let has_flow = vel_len2 > 1.0e-6;
            let flow_angle = if has_flow { vel_z.atan2(vel_x) } else { 0.0 };
            let top_texture = if has_flow { flow_tex } else { still_tex };
            (has_flow, flow_angle, top_texture)
        };
        // Java shrinks heights by 0.001 for top face.
        let p2 = p - eps;
        let o2 = o - eps;
        let q2 = q - eps;
        let r2 = r - eps;

        // UV mapping follows Java's flow vs still logic.
        let mut x;
        let mut y;
        let mut z;
        let mut aa;
        let mut ab;
        let mut ac;
        let mut ad;
        let mut ae;

        if !has_flow {
            x = 0.0;
            y = 0.0;
            z = 0.0;
            aa = 1.0;
            ab = 1.0;
            ac = 1.0;
            ad = 1.0;
            ae = 0.0;
        } else {
            let angle = flow_angle - 1.5707964;
            let (s, c) = angle.sin_cos();
            let ag = s * 0.25;
            let ah = c * 0.25;

            x = 0.5 + (-ah - ag);
            y = 0.5 + (-ah + ag);
            z = 0.5 + (-ah + ag);
            aa = 0.5 + (ah + ag);
            ab = 0.5 + (ah + ag);
            ac = 0.5 + (ah - ag);
            ad = 0.5 + (ah - ag);
            ae = 0.5 + (-ah - ag);

            x = clamp01(x);
            z = clamp01(z);
            ab = clamp01(ab);
            ad = clamp01(ad);
            y = clamp01(y);
            aa = clamp01(aa);
            ac = clamp01(ac);
            ae = clamp01(ae);

            let avg_u = (x + z + ab + ad) * 0.25;
            let avg_v = (y + aa + ac + ae) * 0.25;
            let d = UV_SCALE_DELTA;
            x = lerp(d, x, avg_u);
            z = lerp(d, z, avg_u);
            ab = lerp(d, ab, avg_u);
            ad = lerp(d, ad, avg_u);
            y = lerp(d, y, avg_v);
            aa = lerp(d, aa, avg_v);
            ac = lerp(d, ac, avg_v);
            ae = lerp(d, ae, avg_v);
        }

        // Vertex order matches Java:
        // (0,p,0)->(x,y), (0,r,1)->(z,aa), (1,q,1)->(ab,ac), (1,o,0)->(ad,ae)
        let vx = [0.0, 0.0, 1.0, 1.0];
        let vz = [0.0, 1.0, 1.0, 0.0];
        let vy = [p2, r2, q2, o2];
        let uvs = [[x, y], [z, aa], [ab, ac], [ad, ae]];
        push_packed_quad(
            translucent,
            translucent_indices,
            neighborhood,
            neighbor_access,
            section_y,
            bx,
            by,
            bz,
            block_x,
            block_y,
            block_z,
            Dir::Up.normal(),
            vx,
            vy,
            vz,
            uvs,
            top_texture,
            apply_shade(base_rgb, shade_factor(Dir::Up)),
            info.properties.emissive_intensity,
            material_id,
            options,
        );

        // Java emits a second (reversed) quad when the fluid can flow to pos.up().
        // Approximation: if above isn't the same fluid and isn't a full cube, render underside too.
        let can_flow_up = if let Some(aid) = above_id {
            !same_fluid(manager, aid, fluid_name) && !is_solid_for_fluid_height(manager, aid)
        } else {
            true
        };
        if can_flow_up {
            let vx2 = [0.0, 1.0, 1.0, 0.0];
            let vz2 = [0.0, 0.0, 1.0, 1.0];
            let vy2 = [p2, o2, q2, r2];
            let uvs2 = [[x, y], [ad, ae], [ab, ac], [z, aa]];
            push_packed_quad(
                translucent,
                translucent_indices,
                neighborhood,
                neighbor_access,
                section_y,
                bx,
                by,
                bz,
                block_x,
                block_y,
                block_z,
                Dir::Up.normal(),
                vx2,
                vy2,
                vz2,
                uvs2,
                top_texture,
                apply_shade(base_rgb, shade_factor(Dir::Up)),
                info.properties.emissive_intensity,
                material_id,
                options,
            );
        }
    }

    // BOTTOM
    if render_down {
        // Java uses still sprite min/max; we keep a small delta shrink to avoid bleeding.
        let min_u = UV_SCALE_DELTA;
        let max_u = 1.0 - UV_SCALE_DELTA;
        let min_v = UV_SCALE_DELTA;
        let max_v = 1.0 - UV_SCALE_DELTA;
        let vx = [0.0, 0.0, 1.0, 1.0];
        let vz = [1.0, 0.0, 0.0, 1.0];
        let vy = [w, w, w, w];
        let uvs = [[min_u, max_v], [min_u, min_v], [max_u, min_v], [max_u, max_v]];
        push_packed_quad(
            translucent,
            translucent_indices,
            neighborhood,
            neighbor_access,
            section_y,
            bx,
            by,
            bz,
            block_x,
            block_y,
            block_z,
            Dir::Down.normal(),
            vx,
            vy,
            vz,
            uvs,
            still_tex,
            apply_shade(base_rgb, shade_factor(Dir::Down)),
            info.properties.emissive_intensity,
            material_id,
            options,
        );
    }

    // SIDES (Java iterates horizontal directions and conditionally uses water overlay)
    for dir in [Dir::North, Dir::South, Dir::West, Dir::East] {
        let (render_side, top0, top1, x0, x1, z0, z1) = match dir {
            Dir::North => (
                render_north,
                p,
                o,
                0.0,
                1.0,
                0.0 + eps,
                0.0 + eps,
            ),
            Dir::South => (
                render_south,
                q,
                r,
                1.0,
                0.0,
                1.0 - eps,
                1.0 - eps,
            ),
            Dir::West => (
                render_west,
                r,
                p,
                0.0 + eps,
                0.0 + eps,
                1.0,
                0.0,
            ),
            Dir::East => (
                render_east,
                o,
                q,
                1.0 - eps,
                1.0 - eps,
                0.0,
                1.0,
            ),
            _ => continue,
        };

        if !render_side {
            continue;
        }

        let neighbor_id = neighbors.get(dir);
        if let Some(nid2) = neighbor_id {
            if should_skip_rendering(manager, dir, top0.max(top1), nid2) {
                continue;
            }
        }

        // Water overlay heuristic (Java: translucent blocks or leaves).
        let mut side_texture = flow_tex;
        if !is_lava {
            if let Some(nid2) = neighbor_id {
                if let Some(props) = manager.get_properties_by_id(nid2) {
                    let n = props.name.as_str();
                    let looks_like_leaves = n.contains("leaves") || n.contains("leaf");
                    if props.render_layer == crate::domain::block::registry::LAYER_TRANSLUCENT || looks_like_leaves {
                        side_texture = crate::config::get_water_overlay_tex();
                    }
                }
            }
        }

        // Java side UVs: U in [0,0.5]; V in [(1-height)*0.5 .. 0.5]
        let u0 = 0.0;
        let u1 = 0.5;
        let v0 = (1.0 - clamp01(top0)) * 0.5;
        let v1 = (1.0 - clamp01(top1)) * 0.5;
        let v2 = 0.5;

        let vx = [x0, x1, x1, x0];
        let vz = [z0, z1, z1, z0];
        let vy = [top0, top1, w, w];
        let uvs = [[u0, v0], [u1, v1], [u1, v2], [u0, v2]];

        push_packed_quad(
            translucent,
            translucent_indices,
            neighborhood,
            neighbor_access,
            section_y,
            bx,
            by,
            bz,
            block_x,
            block_y,
            block_z,
            dir.normal(),
            vx,
            vy,
            vz,
            uvs,
            side_texture,
            apply_shade(base_rgb, shade_factor(dir)),
            info.properties.emissive_intensity,
            material_id,
            options,
        );

        // Java: if not overlay sprite, emit a reversed quad as well.
        if side_texture != crate::config::get_water_overlay_tex() {
            let vx2 = [x0, x0, x1, x1];
            let vz2 = [z0, z0, z1, z1];
            let vy2 = [w, top0, top1, w];
            let uvs2 = [[u0, v2], [u0, v0], [u1, v1], [u1, v2]];
            push_packed_quad(
                translucent,
                translucent_indices,
                neighborhood,
                neighbor_access,
                section_y,
                bx,
                by,
                bz,
                block_x,
                block_y,
                block_z,
                dir.normal(),
                vx2,
                vy2,
                vz2,
                uvs2,
                side_texture,
                apply_shade(base_rgb, shade_factor(dir)),
                info.properties.emissive_intensity,
                material_id,
                options,
            );
        }
    }

    true
}
