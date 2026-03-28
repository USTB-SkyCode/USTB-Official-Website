//! # 贪心网格合并 (Greedy Mesher)
//!
//! ## 职责 (Responsibility)
//! 对满足条件的标准立方体面执行二维合并 (2D Merge)，大幅减少顶点数量，从而降低 GPU 顶点处理压力。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入：`SectionContext`、邻域读取器、合并策略配置 (`MesherOptions`)。
//! - 输出：向 `opaque_buffer` 或 `decal_buffer` 写入合并后的四边形顶点数据。
//!
//! ## 合并原则 (MC Mechanism)
//! 1. **几何限制**: 仅对标准 full-cube (0-16 满立方体) 且无旋转的模型启用。
//! 2. **渲染一致性**: 必须具有相同的贴图索引 (`texture_index`)、材质 ID 与渲染层。
//! 3. **光照/AO 限制**: 若开启平滑光照 (Smooth Lighting)，则四个顶点的 AO 分布、天空光与方块光强度必须完全一致。
//! 4. **decal 独立性**: decal 标志为 true 的方块会合并到独立的 decal layer。

use crate::io::anvil::section::ChunkSection;
use crate::mesher::types::{CachedBlockInfo, MesherOptions, Neighborhood};
use crate::mesher::lighting::{calculate_flat_light, calculate_smooth_light, get_light_at_in_neighborhood};
use crate::mesher::encoding::TerrainCompactEncoder;
use crate::mesher::semantic::VertexSemantic;
use crate::domain::block::BlockModelManager;
use crate::mesher::services::culling::CullingService;
use crate::mesher::context::{MeshContext, SectionContext};
use crate::mesher::services::neighbor::NeighborAccess;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct MergeKey {
    texture_index: i32, 
    render_layer: u8,
    mat_id: u8,
    /// Greedy merge key for lighting.
    ///
    /// - When `smooth_lighting` is disabled: uses face-adjacent light packed as
    ///   `block(4 bits) | sky(4 bits)<<4` (8-bit payload stored in low byte).
    /// - When `smooth_lighting` is enabled: packs the 4 smooth-light corner samples,
    ///   each as `block(4) | sky(4)<<4`, into 32 bits: `c0 | c1<<8 | c2<<16 | c3<<24`.
    ///
    /// This prevents greedy merges across AO/smooth-light boundaries that would otherwise
    /// create incorrect "shadow ratios" on large quads.
    light: u32,
}

/// 判断当前方块是否可进入标准 full-cube greedy 路径。
/// decal、translucent、旋转模型、非满方块模型都会被排除。
pub fn is_standard_full_cube(info: &CachedBlockInfo) -> bool {
    // 0. decal 走独立缓冲，不参与标准 greedy。
    if info.properties.is_decal {
        return false;
    }

    // 1. 仅接受 Opaque / Cutout，Translucent 不做 greedy。
    if info.properties.render_layer == 3 {
        return false;
    }
    
    // 2. 允许随机贴图变体，但它仍必须保持标准 full cube 边界。
    let is_random = info.properties.translucent_material_id > 0;
    
    // 3. 检查模型是否覆盖完整 0..16 立方体，且无额外旋转。
    if let Some(model) = &info.model {
        // 随机贴图方块可能带 overlay，允许基于首元素做 full cube 判定。
        if !is_random && model.elements.len() != 1 { return false; }
        
        let el = &model.elements[0];
        
        // 边界必须接近完整 0..16 立方体。
        const EPSILON: f32 = 0.001;
        if (el.from[0]).abs() > EPSILON 
            || (el.from[1]).abs() > EPSILON 
            || (el.from[2]).abs() > EPSILON { return false; }
            
        if (el.to[0] - 16.0).abs() > EPSILON 
            || (el.to[1] - 16.0).abs() > EPSILON 
            || (el.to[2] - 16.0).abs() > EPSILON { return false; }
            
        // 旋转元素无法安全参与标准 greedy。
        if el.rotation.is_some() { return false; }
        
        // 随机贴图方块允许 shader 侧处理旋转，因此放宽 x/y 旋转限制。
        if !is_random {
            if el.x.unwrap_or(0.0) != 0.0 { return false; }
            if el.y.unwrap_or(0.0) != 0.0 { return false; }
        }
        
        return true;
    }
    
    false
}

/// Greedy Meshing for a specific face direction
/// dir_idx: 0=Up, 1=Down, 2=North, 3=South, 4=West, 5=East (Matches geometry.rs)
/// 算法分为三步：构建 16x16 mask、在 U/V 平面做贪心扩张、发射一个合并后的 quad。
fn mesh_direction(
    dir_idx: usize,
    opaque_buffer: &mut Vec<u8>,
    opaque_indices: &mut Vec<u32>,
    decal_buffer: &mut Vec<u8>,
    decal_indices: &mut Vec<u32>,
    section_ctx: &SectionContext,
    neighbor: &NeighborAccess,
    processed_mask: &mut Option<&mut [bool; 4096]>,
    options: MesherOptions,
) {
    // 1. Build mask for the slice
    // We treat the chunk as slices along the main axis of the direction.
    // For Up/Down (Y), slice is XZ plane. Iterate Y.
    // For North/South (Z), slice is XY plane. Iterate Z.
    // For East/West (X), slice is YZ plane. Iterate X.

    let (_u_axis, _v_axis, _d_axis) = match dir_idx {
        0 | 1 => (0, 2, 1), // Y axis is depth. U=X, V=Z
        2 | 3 => (0, 1, 2), // Z axis is depth. U=X, V=Y
        4 | 5 => (2, 1, 0), // X axis is depth. U=Z, V=Y 
        _ => return,
    };

    // Direction normal for culling
    let (dx, dy, dz) = match dir_idx {
        0 => (0, 1, 0),
        1 => (0, -1, 0),
        2 => (0, 0, -1),
        3 => (0, 0, 1),
        4 => (-1, 0, 0),
        5 => (1, 0, 0),
        _ => (0, 0, 0),
    };

    // Iterate through depth (0..16)
    for d in 0..16 {
        // Mask for the current slice: 16x16
        let mut mask: [Option<MergeKey>; 256] = [None; 256];

        // Fill mask
        for v in 0..16 {
            for u in 0..16 {
                // Map (u, v, d) to (x, y, z)
                let (x, y, z) = match dir_idx {
                    0 | 1 => (u, d, v),
                    2 | 3 => (u, v, d),
                    4 | 5 => (d, v, u), // X is depth
                    _ => (0, 0, 0),
                };

                let palette_idx = section_ctx.section.get_block_palette_index(x, y, z);
                if palette_idx >= section_ctx.palette.len() { continue; }
                let info = &section_ctx.palette[palette_idx];

                if info.properties.is_air { continue; }
                
                // Only mesh opaque, standard cubes
                // Strict sync with generator.rs skipping logic:
                // generator.rs skips if: render_layer == 0 && !has_variants
                

                // Use strict check for geometry
                if !is_standard_full_cube(info) {
                    continue;
                }

                // Culling Check
                let mut visible = true;
                
                // Check neighbor at (x+dx, y+dy, z+dz)
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                let nz = z as i32 + dz;

                if let Some(n_props) = neighbor.props_at_any(nx, ny, nz) {
                    if CullingService::should_cull(info, dir_idx, n_props) {
                        visible = false;
                    }
                } else {
                    // Neighbor is unloaded/missing -> Draw
                    visible = true;
                }



                if visible {
                    let tex_id = if let Some(_model) = &info.model {
                         // As we don't have public access to model faces texture index (yet), 
                         // and we don't want to modify too much.
                         // We skip setting texture ID here for now, or assume 0?
                         // Ideally we should use `model.elements[0].faces[dir].texture`.
                         // BUT `model.elements` is public in `model.rs`!
                         // So we can access it if `ModelElement` is public.
                         // Re-checked `model.rs`: `BlockModel`, `ModelElement`, `ModelFace` fields are public.
                         
                         // Map dir_idx to face index. 
                         // dir_idx: 0=Up, 1=Down, 2=North, 3=South, 4=West, 5=East
                         // BlockModel::elements[0].faces: [Option<ModelFace>; 6]
                         // indices: 0=up, 1=down, 2=north, 3=south, 4=west, 5=east.
                         
                         // BUT: `BlockModel` uses the same indices?
                         // `model.rs`: `dir_from_str("up")` -> 0.
                         // So indices match.
                         
                         if let Some(first_el) = _model.elements.first() {
                             if let Some(face) = &first_el.faces[dir_idx] {
                                 face.texture
                             } else {
                                 -1
                             }
                         } else {
                             -1
                         }
                    } else {
                        -1
                    };
                    
                    if tex_id != -1 {
                         // Optional light key: when vertex lighting is enabled we prevent greedy merges
                         // across different light values (coarse boundary split).
                         // Match bak: break greedy merges on face-adjacent light changes when vertex lighting is enabled.
                         let light_key: u32 = if options.vertex_lighting {
                             if options.smooth_lighting {
                                 let corners = calculate_smooth_light(
                                     neighbor,
                                     section_ctx.ctx.neighborhood,
                                     section_ctx.section_y,
                                     x as i32,
                                     y as i32,
                                     z as i32,
                                     dir_idx,
                                     options.vertex_ao,
                                 );

                                 let pack_corner = |c: (f32, f32)| -> u32 {
                                     let bl = (c.0 * 15.0).round().clamp(0.0, 15.0) as u32;
                                     let sl = (c.1 * 15.0).round().clamp(0.0, 15.0) as u32;
                                     (bl & 0xF) | ((sl & 0xF) << 4)
                                 };

                                 let c0 = pack_corner(corners[0]);
                                 let c1 = pack_corner(corners[1]);
                                 let c2 = pack_corner(corners[2]);
                                 let c3 = pack_corner(corners[3]);
                                 c0 | (c1 << 8) | (c2 << 16) | (c3 << 24)
                             } else {
                                 let (mut cx, mut cy, mut cz) = (x as i32, y as i32, z as i32);
                                 match dir_idx {
                                     0 => cy += 1,
                                     1 => cy -= 1,
                                     2 => cz -= 1,
                                     3 => cz += 1,
                                     4 => cx -= 1,
                                     5 => cx += 1,
                                     _ => {}
                                 }
                                 let (bl, sl) = get_light_at_in_neighborhood(
                                     section_ctx.ctx.neighborhood,
                                     section_ctx.section_y,
                                     cx,
                                     cy,
                                     cz,
                                 );
                                 (bl as u32) | ((sl as u32) << 4)
                             }
                         } else {
                             0
                         };

                         mask[v * 16 + u] = Some(MergeKey {
                             texture_index: tex_id,
                             render_layer: info.properties.render_layer,
                             mat_id: info.properties.translucent_material_id,
                             light: light_key,
                         });
                    }
                }
            }
        }
        
        // 2. Greedy Sweep over mask
        let mut n = 0;
        while n < 256 {
            let u = n % 16;
            let v = n / 16;
            
            if let Some(key) = mask[n] {
                // Determine width (U-axis merge)
                // Fix for stretched AO: Only merge horizontally if light is uniform along U axis.
                // Light packet format: c0 (BL) | c1 (BR) << 8 | c2 (TR) << 16 | c3 (TL) << 24
                let light_check_u = if options.vertex_lighting {
                    if options.smooth_lighting {
                         let c0 = key.light & 0xFF;
                         let c1 = (key.light >> 8) & 0xFF;
                         let c2 = (key.light >> 16) & 0xFF;
                         let c3 = (key.light >> 24) & 0xFF;
                         // Only merge horizontally if the light is constant horizontally.
                         // BL == BR and TL == TR
                         c0 == c1 && c3 == c2
                    } else {
                        true
                    }
                } else {
                    true
                };
                
                let mut w = 1;
                // [Optimization] If we CANNOT merge horizontally, we still check vertically.
                // The original code merged horizontal first.
                // If light_check_u is false, w=1.
                // If light_check_v is true, we might merge vertically (forming a column).

                if light_check_u {
                    while u + w < 16 && mask[n + w] == Some(key) {
                        w += 1;
                    }
                }
                
                // Determine height (V-axis merge)
                // Fix for stretched AO: Only merge vertically if light is uniform along V axis.
                let light_check_v = if options.vertex_lighting {
                    if options.smooth_lighting {
                         let c0 = key.light & 0xFF;
                         let c1 = (key.light >> 8) & 0xFF;
                         let c2 = (key.light >> 16) & 0xFF;
                         let c3 = (key.light >> 24) & 0xFF;
                         // Only merge vertically if the light is constant vertically.
                         // BL == TL and BR == TR
                         c0 == c3 && c1 == c2
                    } else {
                        true
                    }
                } else {
                    true
                };

                let mut h = 1;

                if light_check_v {
                    'h_search: while v + h < 16 {
                        for k in 0..w {
                            if mask[n + k + h * 16] != Some(key) {
                                break 'h_search;
                            }
                        }
                        h += 1;
                    }
                }

                // Emit Quad
                // Convert (u,v,d) back to (x,y,z) origin
                 let (x, y, z) = match dir_idx {
                    0 | 1 => (u, d, v),
                    2 | 3 => (u, v, d),
                    4 | 5 => (d, v, u), // X is depth. 
                    _ => (0, 0, 0),
                };
                
                // Dimensions in world axis
                let (width_x, width_y, width_z) = match dir_idx {
                     0 | 1 => (w as f32, 1.0, h as f32), // Y slice -> XZ size (u=x, v=z -> width=w(x), height=h(z))
                     2 | 3 => (w as f32, h as f32, 1.0), // Z slice -> XY size (u=x, v=y -> width=w(x), height=h(y))
                     4 | 5 => (1.0, h as f32, w as f32), // X slice -> ZY size (u=z, v=y -> width=w(z), height=h(y)) 
                     _ => (0.0, 0.0, 0.0),
                };
                
                let use_decal = key.render_layer == 1 || key.render_layer == 2;
                if use_decal {
                    add_greedy_quad(
                        decal_buffer, decal_indices,
                        dir_idx,
                        x as f32, y as f32, z as f32,
                        width_x, width_y, width_z,
                        key,
                        section_ctx.ctx.manager,
                        neighbor,
                        section_ctx.ctx.neighborhood,
                        section_ctx.section_y,
                        // Pass info (Look it up again using starting coords of the quad)
                        {
                            let p_idx = section_ctx.section.get_block_palette_index(x as usize, y as usize, z as usize);
                            &section_ctx.palette[p_idx]
                        },
                        options,
                    );
                } else {
                    add_greedy_quad(
                        opaque_buffer, opaque_indices,
                        dir_idx,
                        x as f32, y as f32, z as f32,
                        width_x, width_y, width_z,
                        key,
                        section_ctx.ctx.manager,
                        neighbor,
                        section_ctx.ctx.neighborhood,
                        section_ctx.section_y,
                        // Pass info (Look it up again using starting coords of the quad)
                        {
                            let p_idx = section_ctx.section.get_block_palette_index(x as usize, y as usize, z as usize);
                            &section_ctx.palette[p_idx]
                        },
                        options,
                    );
                }
                
                // Clear mask
                for dy in 0..h {
                    for dx in 0..w {
                        mask[n + dx + dy * 16] = None;
                    }
                }
                
                // Mark processed in global mask if needed
                 if let Some(_global_mask) = processed_mask {
                    // Re-loop to mark blocks? 
                    // Or we just rely on "Standard blocks are ALL handled by greedy".
                    // The `generator.rs` should just skip standard blocks entirely.
                 }
            }
            n += 1;
        }
    }
}

fn add_greedy_quad(
    buffer: &mut Vec<u8>,
    indices_buffer: &mut Vec<u32>,
    dir_idx: usize,
    x: f32, y: f32, z: f32,
    wx: f32, wy: f32, wz: f32,
    key: MergeKey,
    manager: &BlockModelManager,
    neighbor_access: &NeighborAccess,
    neighborhood: &Neighborhood,
    section_y: i32,
    info_start: &CachedBlockInfo,
    options: MesherOptions,
) {
    // Determine 4 corners for lighting
    
    // Define the 4 vertices positions (Relative to chunk origin 0..16)
    // Matches `add_face` logic
    let min_x = x;     let max_x = x + wx;
    let min_y = y;     let max_y = y + wy;
    let min_z = z;     let max_z = z + wz;
    
    // Keep greedy quad vertex order identical to `passes/quads.rs::add_face` so
    // one fixed terrain index order can be shared by all opaque/decal producers.
    let (vx, vy, vz) = match dir_idx {
        0 => (
            [min_x, max_x, max_x, min_x],
            [max_y, max_y, max_y, max_y],
            [min_z, min_z, max_z, max_z],
        ),
        1 => (
            [min_x, max_x, max_x, min_x],
            [min_y, min_y, min_y, min_y],
            [max_z, max_z, min_z, min_z],
        ),
        2 => (
            [max_x, min_x, min_x, max_x],
            [max_y, max_y, min_y, min_y],
            [min_z, min_z, min_z, min_z],
        ),
        3 => (
            [min_x, max_x, max_x, min_x],
            [max_y, max_y, min_y, min_y],
            [max_z, max_z, max_z, max_z],
        ),
        4 => (
            [min_x, min_x, min_x, min_x],
            [max_y, max_y, min_y, min_y],
            [min_z, max_z, max_z, min_z],
        ),
        5 => (
            [max_x, max_x, max_x, max_x],
            [max_y, max_y, min_y, min_y],
            [max_z, min_z, min_z, max_z],
        ),
        _ => return,
    };
    
    // Compute Normal (Standard axis aligned)
    let (nx, ny, nz) = match dir_idx {
         0 => (0.0, 1.0, 0.0), 1 => (0.0, -1.0, 0.0),
         2 => (0.0, 0.0, -1.0), 3 => (0.0, 0.0, 1.0),
         4 => (-1.0, 0.0, 0.0), 5 => (1.0, 0.0, 0.0),
         _ => (0.0, 1.0, 0.0),
    };

    let mut vertex_lights = [(0.0, 0.0); 4];
    
    for i in 0..4 {
        let bx = if vx[i] == max_x && wx > 0.0 { max_x - 1.0 } else { vx[i] };
        let by = if vy[i] == max_y && wy > 0.0 { max_y - 1.0 } else { vy[i] };
        let bz = if vz[i] == max_z && wz > 0.0 { max_z - 1.0 } else { vz[i] };
        
        let all_lights = if options.vertex_lighting {
            if options.smooth_lighting {
                calculate_smooth_light(
                    neighbor_access,
                    neighborhood,
                    section_y,
                    bx as i32,
                    by as i32,
                    bz as i32,
                    dir_idx,
                    options.vertex_ao,
                )
            } else {
                calculate_flat_light(
                    neighborhood,
                    section_y,
                    bx as i32,
                    by as i32,
                    bz as i32,
                    dir_idx,
                )
            }
        } else {
            // Vertex lighting disabled: keep packed data in a safe neutral state.
            [(0.0, 1.0); 4]
        };

        // IMPORTANT:
        // `calculate_*_light(..)` returns 4 corner values in a fixed order per face direction.
        // We must map those corners to this vertex based on the vertex's local (within-block) corner,
        // not based on the vertex index `i`.
        //
        // Otherwise, certain directions (notably world-Z for top faces) can show striping because
        // the corners are effectively rotated/flipped.
        let fx = vx[i] - bx;
        let fy = vy[i] - by;
        let fz = vz[i] - bz;

        let is_east = fx > 0.5;
        let is_south = fz > 0.5;
        let is_up = fy > 0.5;

        let mapped = match dir_idx {
            // Up (+Y): (west,north)=0, (east,north)=1, (east,south)=2, (west,south)=3
            0 => match (is_east, is_south) {
                (false, false) => all_lights[0],
                (true, false) => all_lights[1],
                (true, true) => all_lights[2],
                (false, true) => all_lights[3],
            },
            // Down (-Y): (west,south)=0, (east,south)=1, (east,north)=2, (west,north)=3
            1 => match (is_east, is_south) {
                (false, true) => all_lights[0],
                (true, true) => all_lights[1],
                (true, false) => all_lights[2],
                (false, false) => all_lights[3],
            },
            // North (-Z): keys are (east,up)
            2 => match (is_east, is_up) {
                (true, true) => all_lights[0],
                (false, true) => all_lights[1],
                (false, false) => all_lights[2],
                (true, false) => all_lights[3],
            },
            // South (+Z): keys are (east,up)
            3 => match (is_east, is_up) {
                (false, true) => all_lights[0],
                (true, true) => all_lights[1],
                (true, false) => all_lights[2],
                (false, false) => all_lights[3],
            },
            // West (-X): keys are (south,up)
            4 => match (is_south, is_up) {
                (false, true) => all_lights[0],
                (true, true) => all_lights[1],
                (true, false) => all_lights[2],
                (false, false) => all_lights[3],
            },
            // East (+X): keys are (south,up)
            5 => match (is_south, is_up) {
                (true, true) => all_lights[0],
                (false, true) => all_lights[1],
                (false, false) => all_lights[2],
                (true, false) => all_lights[3],
            },
            _ => all_lights[i],
        };

        vertex_lights[i] = mapped;
    }

    // Pack loop
    let mut packed_vertices = [[0u8; TerrainCompactEncoder::VERTEX_STRIDE_BYTES]; 4];

    for idx in 0..4 {
        let section_offset_y = (section_y * 16) as f32;
        let final_y = vy[idx] + section_offset_y;
        let (bl, sl) = vertex_lights[idx];

        let (u_dbg, v_dbg) = match idx {
            0 => (0.0f32, 0.0f32),
            1 => (1.0f32, 0.0f32),
            2 => (1.0f32, 1.0f32),
            3 => (0.0f32, 1.0f32),
            _ => (0.0f32, 0.0f32),
        };

        // Default White
        let mut r_u8 = 255u32;
        let mut g_u8 = 255u32;
        let mut b_u8 = 255u32;

        // Apply biome tint for grass_block top face when using greedy.
        if dir_idx == 0 && info_start.properties.name.as_str() == "grass_block" {
            let tint = crate::mesher::biome::sample_biome_tint(
                neighborhood,
                manager,
                info_start.id,
                0,
                x as i32,
                z as i32,
            );
            r_u8 = (tint[0].clamp(0.0, 1.0) * 255.0) as u32;
            g_u8 = (tint[1].clamp(0.0, 1.0) * 255.0) as u32;
            b_u8 = (tint[2].clamp(0.0, 1.0) * 255.0) as u32;
        } else if info_start.properties.name.as_str().contains("leaves") {
            let tint = crate::mesher::biome::sample_biome_tint(
                neighborhood,
                manager,
                info_start.id,
                0,
                x as i32,
                z as i32,
            );
            r_u8 = (tint[0].clamp(0.0, 1.0) * 255.0) as u32;
            g_u8 = (tint[1].clamp(0.0, 1.0) * 255.0) as u32;
            b_u8 = (tint[2].clamp(0.0, 1.0) * 255.0) as u32;
        }
        
        let emit = if info_start.properties.emissive_intensity > 0.0 { 1.0 } else { 0.0 };

        let semantic = VertexSemantic {
            position: [vx[idx], final_y, vz[idx]],
            normal: [nx, ny, nz],
            uv0: [u_dbg, v_dbg],
            color0: [
                (r_u8 as f32 / 255.0).clamp(0.0, 1.0),
                (g_u8 as f32 / 255.0).clamp(0.0, 1.0),
                (b_u8 as f32 / 255.0).clamp(0.0, 1.0),
                emit,
            ],
            block_light: bl,
            sky_light: sl,
            texture_index: key.texture_index,
            material_id: key.mat_id,
            extra_u32: TerrainCompactEncoder::FLAG_WORLD_UV,
        };

        packed_vertices[idx] = TerrainCompactEncoder::encode_vertex_bytes(&semantic);
    }

    // Append to buffers
    let start_index = (buffer.len() / TerrainCompactEncoder::VERTEX_STRIDE_BYTES) as u32;
    buffer.reserve(TerrainCompactEncoder::VERTEX_STRIDE_BYTES * 4);
    for v in &packed_vertices {
        buffer.extend_from_slice(v);
    }
    
    TerrainCompactEncoder::append_indices_u32(indices_buffer, start_index, [0, 2, 1, 0, 3, 2]);
}

/// Entry point 
pub fn mesh_section_greedy(
    opaque_buffer: &mut Vec<u8>,
    opaque_indices: &mut Vec<u32>,
    decal_buffer: &mut Vec<u8>,
    decal_indices: &mut Vec<u32>,
    neighborhood: &Neighborhood,
    section_y: i32,
    section: &ChunkSection,
    palette_cache: &Vec<CachedBlockInfo>,
    chunk_props_cache: &Vec<Option<Vec<crate::domain::block::CachedBlockProperties>>>,
    manager: &BlockModelManager,
    options: MesherOptions,
) {
    let mesh_ctx = MeshContext {
        neighborhood,
        chunk_props_cache,
        manager,
        options,
    };
    let section_ctx = SectionContext::new(&mesh_ctx, section, section_y, palette_cache);
    let neighbor = NeighborAccess::new(&section_ctx);

    for dir in 0..6 {
        mesh_direction(
            dir,
            opaque_buffer,
            opaque_indices,
            decal_buffer,
            decal_indices,
            &section_ctx,
            &neighbor,
            &mut None,
            options,
        );
    }
}
