//! # 面片发射模块 (Quad Emission)
//!
//! ## 职责
//! 把单个 `BlockModel` 的一个面转换为 GPU 友好的顶点与索引数据。
//!
//! ## 功能
//! - 顶点旋转与 uvlock 处理
//! - 邻居遮挡剔除
//! - 平滑光照 / AO 采样
//! - 顶点语义编码为 terrain compact 字节流

use rustc_hash::FxHashMap;
use std::rc::Rc;

use crate::domain::block::{BlockId, BlockModelManager};
use crate::domain::block::model::{BlockModel, ModelElement, ModelFace};

use crate::mesher::context::SectionContext;
use crate::mesher::encoding::TerrainCompactEncoder;
use crate::mesher::services::culling::CullingService;
use crate::mesher::geometry::{calculate_uvlock, rotate_point, rotate_points_soa};
use crate::mesher::lighting::{calculate_flat_light, calculate_smooth_light};
use crate::mesher::semantic::VertexSemantic;
use crate::mesher::services::neighbor::NeighborAccess;
use crate::mesher::services::model_cache::ModelCache;
use crate::mesher::types::{CachedBlockInfo, MesherOptions};

// 纹理索引通过 `crate::config` 在运行时配置。

#[inline]
fn default_water_tint_linear() -> [f32; 3] {
    // 必须与 `BlockModelManager::get_tint(..)` 中 water 的默认值保持一致。
    let sr = 63.0f32 / 255.0;
    let sg = 118.0f32 / 255.0;
    let sb = 228.0f32 / 255.0;
    [sr * sr, sg * sg, sb * sb]
}

#[inline]
fn water_tint_rgb_u8(manager: &BlockModelManager, biome_id: crate::domain::biome::BiomeId) -> (u32, u32, u32) {
    let tint = manager
        .lookup_simple_id("water")
        .and_then(|id| manager.get_properties_by_id(id).map(|p| p.name.as_str() == "water").filter(|v| *v).map(|_| id))
        .map(|id| manager.get_tint(id, 0, biome_id))
        .unwrap_or_else(default_water_tint_linear);
    (
        (tint[0].clamp(0.0, 1.0) * 255.0) as u32,
        (tint[1].clamp(0.0, 1.0) * 255.0) as u32,
        (tint[2].clamp(0.0, 1.0) * 255.0) as u32,
    )
}

/// 向几何缓冲区添加一个面的数据。
/// 这是整个 block-model 路径最热的函数之一。
/// 
/// # Parameters
/// - `buffer`: 目标顶点缓冲区 (u8 vec)。
/// - `indices_buffer`: 目标索引缓冲区 (u32 vec)。
/// - `manager`: 资源管理器。
/// - `model_cache`: 线程局部模型缓存。
/// - `section_ctx`: 当前 Section 上下文。
/// - `neighbors`: 邻居访问器。
/// - `x, y, z`: 方块在 Chunk 内的坐标 (浮点，用于偏移)。
/// - `element, dir_idx, face`: 当前处理的模型元素和面。
/// - `info`: 当前方块的缓存信息。
/// - `bx, by, bz`: 方块在 Chunk 内的整数坐标。
#[allow(clippy::too_many_arguments)]
pub fn add_face(
    buffer: &mut Vec<u8>,
    indices_buffer: &mut Vec<u32>,
    manager: &BlockModelManager,
    _model_cache: &mut FxHashMap<BlockId, Rc<BlockModel>>,
    section_ctx: &SectionContext,
    neighbors: &NeighborAccess,
    x: f32,
    y: f32,
    z: f32,
    element: &ModelElement,
    dir_idx: usize,
    face: &ModelFace,
    info: &CachedBlockInfo,
    bx: i32,
    by: i32,
    bz: i32,
    options: MesherOptions,
) {
    // 1. 计算基础法线，并叠加 element 级与 block 级旋转。
    let mut base_normal = match dir_idx {
        0 => [0.0, 1.0, 0.0],
        1 => [0.0, -1.0, 0.0],
        2 => [0.0, 0.0, -1.0],
        3 => [0.0, 0.0, 1.0],
        4 => [-1.0, 0.0, 0.0],
        5 => [1.0, 0.0, 0.0],
        _ => [0.0, 1.0, 0.0],
    };

    if let Some(rot) = &element.rotation {
        let angle = rot.angle.to_radians();
        let axis = rot.axis;
        base_normal = rotate_point(base_normal, [0.0, 0.0, 0.0], axis, angle);
    }

    let mut rx = 0.0f32;
    let mut ry = 0.0f32;
    if let Some(x_rot) = element.x {
        rx = (-x_rot).to_radians();
        base_normal = rotate_point(base_normal, [0.0, 0.0, 0.0], 0, rx);
    }
    if let Some(y_rot) = element.y {
        ry = (-y_rot).to_radians();
        base_normal = rotate_point(base_normal, [0.0, 0.0, 0.0], 1, ry);
    }

    let min = element.from;
    let max = element.to;
    
    let min_x = min[0] / 16.0;
    let min_y = min[1] / 16.0;
    let min_z = min[2] / 16.0;
    let max_x = max[0] / 16.0;
    let max_y = max[1] / 16.0;
    let max_z = max[2] / 16.0;

    let (mut vx, mut vy, mut vz) = match dir_idx {
        0 => (
            [min_x, max_x, max_x, min_x],
            [max_y, max_y, max_y, max_y],
            [min_z, min_z, max_z, max_z]
        ),
        1 => (
            [min_x, max_x, max_x, min_x],
            [min_y, min_y, min_y, min_y],
            [max_z, max_z, min_z, min_z]
        ),
        2 => (
            [max_x, min_x, min_x, max_x],
            [max_y, max_y, min_y, min_y],
            [min_z, min_z, min_z, min_z]
        ),
        3 => (
            [min_x, max_x, max_x, min_x],
            [max_y, max_y, min_y, min_y],
            [max_z, max_z, max_z, max_z]
        ),
        4 => (
            [min_x, min_x, min_x, min_x],
            [max_y, max_y, min_y, min_y],
            [min_z, max_z, max_z, min_z]
        ),
        5 => (
            [max_x, max_x, max_x, max_x],
            [max_y, max_y, min_y, min_y],
            [max_z, min_z, min_z, max_z]
        ),
        _ => return,
    };

    let u0 = face.uv[0] / 16.0;
    let v0 = face.uv[1] / 16.0;
    let u1 = face.uv[2] / 16.0;
    let v1 = face.uv[3] / 16.0;
    
    let tid = face.texture as f32;

    if let Some(rot) = &element.rotation {
        let origin = [rot.origin[0] / 16.0, rot.origin[1] / 16.0, rot.origin[2] / 16.0];
        let angle = rot.angle.to_radians();
        let axis = rot.axis;

        rotate_points_soa(&mut vx, &mut vy, &mut vz, origin, axis, angle);
    }

    if element.x.is_some() {
        let origin = [0.5, 0.5, 0.5];
        rotate_points_soa(&mut vx, &mut vy, &mut vz, origin, 0, rx);
    }
    if element.y.is_some() {
        let origin = [0.5, 0.5, 0.5];
        rotate_points_soa(&mut vx, &mut vy, &mut vz, origin, 1, ry);
    }

    let normal = base_normal;

    let mut uv_rot = face.rotation.unwrap_or(0.0);
    if element.uvlock.unwrap_or(false) {
        uv_rot += calculate_uvlock(dir_idx, rx, ry) as f32;
    }

    uv_rot = ((uv_rot % 360.0) + 360.0) % 360.0;

    let mut uv00 = [u0, v0];
    let mut uv01 = [u0, v1];
    let mut uv11 = [u1, v1];
    let mut uv10 = [u1, v0];

    let rot_rounded = (uv_rot / 90.0).round() as i32 * 90;
    match rot_rounded.rem_euclid(360) {
        90 => {
            let temp = uv00; uv00 = uv01; uv01 = uv11; uv11 = uv10; uv10 = temp;
        },
        180 => {
            let t00 = uv00; let t01 = uv01; uv00 = uv11; uv01 = uv10; uv11 = t00; uv10 = t01;
        },
        270 => {
            let temp = uv00; uv00 = uv10; uv10 = uv11; uv11 = uv01; uv01 = temp;
        },
        _ => {},
    }

    if let Some(cull_dir_idx) = face.cull_dir {
        if face.is_boundary {
        let is_boundary = true;

        if is_boundary {
            const DIR_OFFSETS: [(i32, i32, i32); 6] = [
                (0, 1, 0),
                (0, -1, 0),
                (0, 0, -1),
                (0, 0, 1),
                (-1, 0, 0),
                (1, 0, 0),
            ];
            let (dx, dy, dz) = DIR_OFFSETS.get(cull_dir_idx).copied().unwrap_or((0, 0, 0));

            let nx = bx + dx;
            let ny = by + dy;
            let nz = bz + dz;

            let mut culled = false;

            if let Some(neighbor_props) = neighbors.props_at_any(nx, ny, nz) {
                if CullingService::should_cull(info, cull_dir_idx, neighbor_props) {
                    culled = true;
                }
            }
            
            if culled { return; }
        }
    }
    }

    let light_dir = crate::utils::closest_axis(normal);
    // greedy quad 可能远大于 1x1，如果只按起始体素采样一次平滑光照，会把整块面都染成同一组角点值。
    // 这里按顶点所在角落重新采样，对大面保持正确的光照过渡。
    const CORNER_EPS: f32 = 0.0001;
    let min_vx = vx.iter().fold(f32::INFINITY, |a, &b| a.min(b));
    let max_vx = vx.iter().fold(f32::NEG_INFINITY, |a, &b| a.max(b));
    let min_vy = vy.iter().fold(f32::INFINITY, |a, &b| a.min(b));
    let max_vy = vy.iter().fold(f32::NEG_INFINITY, |a, &b| a.max(b));
    let min_vz = vz.iter().fold(f32::INFINITY, |a, &b| a.min(b));
    let max_vz = vz.iter().fold(f32::NEG_INFINITY, |a, &b| a.max(b));

    let x0 = min_vx.floor() as i32;
    let x1 = (max_vx - CORNER_EPS).floor() as i32;
    let y0 = min_vy.floor() as i32;
    let y1 = (max_vy - CORNER_EPS).floor() as i32;
    let z0 = min_vz.floor() as i32;
    let z1 = (max_vz - CORNER_EPS).floor() as i32;

    let mid_vx = 0.5 * (min_vx + max_vx);
    let mid_vy = 0.5 * (min_vy + max_vy);
    let mid_vz = 0.5 * (min_vz + max_vz);

    let mut per_vertex_lights: [(f32, f32); 4] = [(0.0, 1.0); 4];
    if options.vertex_lighting {
        for idx in 0..4 {
            let is_east = vx[idx] > mid_vx;
            let is_up = vy[idx] > mid_vy;
            let is_south = vz[idx] > mid_vz;

            // 为当前顶点选择一个代表性 corner voxel。
            let (sx, sy, sz) = match light_dir {
                // Up/Down faces -> vary in X/Z
                0 | 1 => (
                    bx + if is_east { x1 } else { x0 },
                    by,
                    bz + if is_south { z1 } else { z0 },
                ),
                // North/South faces -> vary in X/Y
                2 | 3 => (
                    bx + if is_east { x1 } else { x0 },
                    by + if is_up { y1 } else { y0 },
                    bz,
                ),
                // West/East faces -> vary in Y/Z
                4 | 5 => (
                    bx,
                    by + if is_up { y1 } else { y0 },
                    bz + if is_south { z1 } else { z0 },
                ),
                _ => (bx, by, bz),
            };

            let corners = if options.smooth_lighting {
                calculate_smooth_light(
                    neighbors,
                    section_ctx.ctx.neighborhood,
                    section_ctx.section_y,
                    sx,
                    sy,
                    sz,
                    light_dir,
                    options.vertex_ao,
                )
            } else {
                calculate_flat_light(section_ctx.ctx.neighborhood, section_ctx.section_y, sx, sy, sz, light_dir)
            };

            // 从采样结果中选择当前顶点对应的角点值。
            per_vertex_lights[idx] = match light_dir {
                0 => match (is_east, is_south) {
                    (false, false) => corners[0],
                    (true, false) => corners[1],
                    (true, true) => corners[2],
                    (false, true) => corners[3],
                },
                1 => match (is_east, is_south) {
                    (false, true) => corners[0],
                    (true, true) => corners[1],
                    (true, false) => corners[2],
                    (false, false) => corners[3],
                },
                2 => match (is_east, is_up) {
                    (true, true) => corners[0],
                    (false, true) => corners[1],
                    (false, false) => corners[2],
                    (true, false) => corners[3],
                },
                3 => match (is_east, is_up) {
                    (false, true) => corners[0],
                    (true, true) => corners[1],
                    (true, false) => corners[2],
                    (false, false) => corners[3],
                },
                4 => match (is_south, is_up) {
                    (false, true) => corners[0],
                    (true, true) => corners[1],
                    (true, false) => corners[2],
                    (false, false) => corners[3],
                },
                5 => match (is_south, is_up) {
                    (true, true) => corners[0],
                    (false, true) => corners[1],
                    (false, false) => corners[2],
                    (true, false) => corners[3],
                },
                _ => corners[idx],
            };
        }
    }
    
    let final_uvs = [uv00, uv10, uv11, uv01];

    // 2. 计算面级不变量：颜色、发光、纹理层、法线等。
    let biome_id = section_ctx.ctx.neighborhood.center.get_biome_2d(bx as usize, bz as usize);
    let block_name = info.properties.name.as_str();
    let water_still_tex = crate::config::get_water_still_tex() as i32;
    let water_flow_tex = crate::config::get_water_flow_tex() as i32;
    let water_overlay_tex = crate::config::get_water_overlay_tex() as i32;
    let is_water_tex = face.texture == water_still_tex
        || face.texture == water_flow_tex
        || face.texture == water_overlay_tex;

    let (r, g, b) = if is_water_tex {
        water_tint_rgb_u8(manager, biome_id)
    } else if let Some(tidx) = face.tintindex {
        let tint = manager.get_tint(info.id, tidx, biome_id);
        (
            (tint[0] * 255.0) as u32,
            (tint[1] * 255.0) as u32,
            (tint[2] * 255.0) as u32,
        )
    } else if block_name.contains("leaves") {
        let tint = manager.get_tint(info.id, 0, biome_id);
        (
            (tint[0] * 255.0) as u32,
            (tint[1] * 255.0) as u32,
            (tint[2] * 255.0) as u32,
        )
    } else {
        (255, 255, 255)
    };

    let emission = ((info.properties.emissive_intensity * 15.0).round() as u32).min(15);
    let material_id = (info.properties.translucent_material_id as u32) & 0xF;

    // --- 优化: 预计算 4 个唯一顶点 ---
    // 目标格式: 32 bytes / vertex

    let mut packed_vertices = [[0u8; TerrainCompactEncoder::VERTEX_STRIDE_BYTES]; 4];

    for idx in 0..4 {
        let (bl, sl) = per_vertex_lights[idx];
        let semantic = VertexSemantic {
            position: [vx[idx] + x, vy[idx] + y, vz[idx] + z],
            normal,
            uv0: final_uvs[idx],
            color0: [
                (r as f32 / 255.0).clamp(0.0, 1.0),
                (g as f32 / 255.0).clamp(0.0, 1.0),
                (b as f32 / 255.0).clamp(0.0, 1.0),
                (emission as f32 / 15.0).clamp(0.0, 1.0),
            ],
            block_light: bl,
            sky_light: sl,
            texture_index: tid as i32,
            material_id: material_id as u8,
            extra_u32: 0,
        };

        packed_vertices[idx] = TerrainCompactEncoder::encode_vertex_bytes(&semantic);
    }
    
    // 3. 写入缓冲
    let start_index = (buffer.len() / TerrainCompactEncoder::VERTEX_STRIDE_BYTES) as u32;

    // 压入 4 个唯一顶点 (64 bytes)
    buffer.reserve(TerrainCompactEncoder::VERTEX_STRIDE_BYTES * 4);
    for v in &packed_vertices {
        buffer.extend_from_slice(v);
    }

    // 压入 6 个索引 (构成两个三角形)
    // 顺序: 0-2-1, 0-3-2 (保证逆时针/顺时针面剔除正确)
    TerrainCompactEncoder::append_indices_u32(indices_buffer, start_index, [0, 2, 1, 0, 3, 2]);
}

pub fn emit_overlay_elements(
    section_ctx: &SectionContext,
    neighbors: &NeighborAccess,
    model_cache: &mut ModelCache,
    opaque: &mut Vec<u8>,
    opaque_indices: &mut Vec<u32>,
    translucent: &mut Vec<u8>,
    translucent_indices: &mut Vec<u32>,
    info: &CachedBlockInfo,
    x: i32,
    y: i32,
    z: i32,
) {
    if !info.properties.has_overlay_elements {
        return;
    }

    let Some(model_ref) = info.model.as_ref() else { return; };

    for element in model_ref.elements.iter().skip(1) {
        for (dir_idx, face_opt) in element.faces.iter().enumerate() {
            let Some(face) = face_opt else { continue; };

            let use_translucent = info.properties.render_layer == 3;
            let target_buf: &mut Vec<u8> = if use_translucent { translucent } else { opaque };
            let target_indices: &mut Vec<u32> = if use_translucent { translucent_indices } else { opaque_indices };

            add_face(
                target_buf,
                target_indices,
                section_ctx.ctx.manager,
                model_cache,
                section_ctx,
                neighbors,
                x as f32,
                (section_ctx.base_y + y) as f32,
                z as f32,
                element,
                dir_idx,
                face,
                info,
                x,
                y,
                z,
                section_ctx.ctx.options,
            );
        }
    }
}
