//! # 网格生成主流程 (Mesh Generator)
//!
//! ## 职责 (Responsibility)
//! 调度单个 Chunk 的完整网格生成流程，串联邻域收集、palette 预计算、greedy meshing、逐块补充几何、光源提取与渲染产物 (Artifact) 组装。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入：中心 Chunk、水平八邻域、`BlockModelManager`、`MesherOptions`。
//! - 输出：包含不透明 (Opaque)、贴花 (Decal)、半透明 (Translucent) 的顶点/索引缓冲，以及提取出的光源列表。
//!
//! ## 核心流程 (Workflow)
//! 1. **邻域构建**: 建立 `Neighborhood` 并根据 `MesherOptions` 确定待处理的 dirty sections。
//! 2. **属性预计算**: 缓存区块级 palette 属性（如是否发光、是否为 Decal 等）。
//! 3. **分层生成**: 逐 Section 执行：
//!    - `mesh_section_greedy`: 对标准立方体进行贪心合并。
//!    - `mesh_section_custom`: 对旋转或非规则模型进行逐个面片生成。
//! 4. **资源提取**: 汇总光源位置与强度 (`ExtractedLight`)。
//! 5. **产物组装**: 通过 `SectionArtifactWriter` 将内存缓冲序列化为 WASM 与 JS 共享的 `ChunkBuildArtifact`。

use crate::io::anvil::chunk::ChunkData;
use crate::domain::block::BlockModelManager;
use crate::domain::block::model::BlockModel;
use std::collections::HashSet;
use std::rc::Rc;

use super::artifacts::ChunkBuildArtifact;
use super::buffer::with_mesh_buffers;
use super::builders::SectionArtifactWriter;
use super::traits::ArtifactWriter;
use super::context::{MeshContext, SectionContext, prepare_chunk_properties, prepare_section_palette};
use super::encoding::TerrainCompactEncoder;
use super::encoding::VertexEncoder;
use super::passes::router::{PassBuffers, PassRouter};
use super::types::{ExtractedLight, Neighborhood, MesherOptions};
use super::services::model_cache::{MODEL_CACHE, fetch_cached_model, maybe_shrink_model_cache};
use super::passes::quads::{add_face, emit_overlay_elements};
use super::artifacts::MeshPass;

// Texture indices are configurable at runtime via `crate::config`.
use super::greedy::mesh_section_greedy;

pub(crate) struct MeshChunkOutputs {
    pub(crate) opaque: Vec<u8>,
    pub(crate) opaque_indices: Vec<u32>,
    pub(crate) decal: Vec<u8>,
    pub(crate) decal_indices: Vec<u32>,
    pub(crate) translucent: Vec<u8>,
    pub(crate) translucent_indices: Vec<u32>,
    pub(crate) lights: Vec<ExtractedLight>,
    pub(crate) artifact: ChunkBuildArtifact,
}

/// 生成单个区块的网格（无邻居数据，边缘面可能缺失）。
/// 这是最小入口，等价于把八邻域全部视为 `None`。
pub fn mesh_chunk(chunk: &ChunkData, manager: &BlockModelManager) -> (Vec<u8>, Vec<u32>, Vec<u8>, Vec<u32>, Vec<u8>, Vec<u32>, Vec<ExtractedLight>) {
    mesh_chunk_with_neighbors(chunk, None, None, None, None, None, None, None, None, manager)
}

/// 生成包含邻居信息的完整区块网格（自动处理边缘面剔除）。
/// 这是 legacy 输出最常用的完整入口。
pub fn mesh_chunk_with_neighbors(
    chunk: &ChunkData,
    north: Option<&ChunkData>,
    south: Option<&ChunkData>,
    east: Option<&ChunkData>,
    west: Option<&ChunkData>,
    north_east: Option<&ChunkData>,
    north_west: Option<&ChunkData>,
    south_east: Option<&ChunkData>,
    south_west: Option<&ChunkData>,
    manager: &BlockModelManager,
) -> (Vec<u8>, Vec<u32>, Vec<u8>, Vec<u32>, Vec<u8>, Vec<u32>, Vec<ExtractedLight>) {
    mesh_chunk_with_neighbors_opts(
        chunk,
        north,
        south,
        east,
        west,
        north_east,
        north_west,
        south_east,
        south_west,
        manager,
        MesherOptions::default(),
    )
}

/// 与 `mesh_chunk_with_neighbors` 相同，但允许覆盖 mesher 行为开关。
#[allow(clippy::too_many_arguments)]
pub fn mesh_chunk_with_neighbors_opts(
    chunk: &ChunkData,
    north: Option<&ChunkData>,
    south: Option<&ChunkData>,
    east: Option<&ChunkData>,
    west: Option<&ChunkData>,
    north_east: Option<&ChunkData>,
    north_west: Option<&ChunkData>,
    south_east: Option<&ChunkData>,
    south_west: Option<&ChunkData>,
    manager: &BlockModelManager,
    options: MesherOptions,
) -> (Vec<u8>, Vec<u32>, Vec<u8>, Vec<u32>, Vec<u8>, Vec<u32>, Vec<ExtractedLight>) {
    let outputs = mesh_chunk_with_neighbors_outputs(
        chunk,
        north,
        south,
        east,
        west,
        north_east,
        north_west,
        south_east,
        south_west,
        manager,
        options,
    );

    (
        outputs.opaque,
        outputs.opaque_indices,
        outputs.decal,
        outputs.decal_indices,
        outputs.translucent,
        outputs.translucent_indices,
        outputs.lights,
    )
}

#[allow(clippy::too_many_arguments)]
/// 只返回新的 artifact 结构，不再展开 legacy 缓冲输出。
pub fn mesh_chunk_artifact_with_neighbors_opts(
    chunk: &ChunkData,
    north: Option<&ChunkData>,
    south: Option<&ChunkData>,
    east: Option<&ChunkData>,
    west: Option<&ChunkData>,
    north_east: Option<&ChunkData>,
    north_west: Option<&ChunkData>,
    south_east: Option<&ChunkData>,
    south_west: Option<&ChunkData>,
    manager: &BlockModelManager,
    options: MesherOptions,
) -> ChunkBuildArtifact {
    mesh_chunk_with_neighbors_outputs(
        chunk,
        north,
        south,
        east,
        west,
        north_east,
        north_west,
        south_east,
        south_west,
        manager,
        options,
    )
    .artifact
}

#[allow(clippy::too_many_arguments)]
/// 生成 chunk 输出全集，包括 legacy 缓冲与 artifact。
pub(crate) fn mesh_chunk_with_neighbors_outputs(
    chunk: &ChunkData,
    north: Option<&ChunkData>,
    south: Option<&ChunkData>,
    east: Option<&ChunkData>,
    west: Option<&ChunkData>,
    north_east: Option<&ChunkData>,
    north_west: Option<&ChunkData>,
    south_east: Option<&ChunkData>,
    south_west: Option<&ChunkData>,
    manager: &BlockModelManager,
    options: MesherOptions,
) -> MeshChunkOutputs {
    mesh_chunk_with_neighbors_outputs_filtered(
        chunk,
        north,
        south,
        east,
        west,
        north_east,
        north_west,
        south_east,
        south_west,
        manager,
        options,
        None,
        true,
    )
}

#[allow(clippy::too_many_arguments)]
/// 带 dirty section 过滤的完整输出入口。
/// `include_legacy_output=false` 时，只构造 section artifact，不把字节流汇总回 legacy 大缓冲。
pub(crate) fn mesh_chunk_with_neighbors_outputs_filtered(
    chunk: &ChunkData,
    north: Option<&ChunkData>,
    south: Option<&ChunkData>,
    east: Option<&ChunkData>,
    west: Option<&ChunkData>,
    north_east: Option<&ChunkData>,
    north_west: Option<&ChunkData>,
    south_east: Option<&ChunkData>,
    south_west: Option<&ChunkData>,
    manager: &BlockModelManager,
    options: MesherOptions,
    dirty_section_ys: Option<&[i32]>,
    include_legacy_output: bool,
) -> MeshChunkOutputs {
    let neighborhood = Neighborhood {
        center: chunk,
        north,
        south,
        east,
        west,
        north_east,
        north_west,
        south_east,
        south_west,
    };

    let encoder = TerrainCompactEncoder;
    let dirty_section_filter = dirty_section_ys
        .filter(|sections| !sections.is_empty())
        .map(|sections| sections.iter().copied().collect::<HashSet<i32>>());

    // 使用线程局部模型缓存，减少重复模型查询与 Rc 克隆。
    MODEL_CACHE.with(|cache_cell: &std::cell::RefCell<crate::mesher::services::model_cache::ModelCache>| {
        let mut cache = cache_cell.borrow_mut();
        // 缓存超限时直接清空，避免 LRU 带来的额外维护成本。
        maybe_shrink_model_cache(&mut cache);

        with_mesh_buffers(|opaque, opaque_indices, decal, decal_indices, translucent, translucent_indices| {
            // lights 典型量级较小，先预留 64 个槽位即可覆盖绝大多数区块。
            let mut lights = Vec::with_capacity(64);
            let mut block_count = 0;
            let mut missing_models = std::collections::HashSet::new();

            // 1. 预计算整个 Chunk 的 palette 属性缓存。
            let chunk_props_cache = prepare_chunk_properties(chunk, manager);
            let mut artifact_writer = SectionArtifactWriter::new();

            let mesh_ctx = MeshContext {
                neighborhood: &neighborhood,
                chunk_props_cache: &chunk_props_cache,
                manager,
                options,
            };

            for (idx, section_opt) in chunk.sections.iter().enumerate() {
                let section = match section_opt {
                    Some(s) => s,
                    None => continue,
                };
                // `section_y` 是 Section 坐标，不是块坐标；后续换算世界 y 需再乘 16。
                let section_y = (idx as i32) + (chunk.min_y as i32);
                let include_section_geometry = dirty_section_filter
                    .as_ref()
                    .map(|sections| sections.contains(&section_y))
                    .unwrap_or(true);
                
                // 2. 预计算当前 Section 的 palette cache。
                let palette_cache = prepare_section_palette(section, chunk_props_cache.get(idx).and_then(|o| o.as_ref()), manager);

                if palette_cache.is_empty() { continue; }

                if !include_section_geometry {
                    // 仅补光源，不生成几何，适用于脏 section 过滤后的部分重建。
                    for y in 0..16 {
                        for z in 0..16 {
                            for x in 0..16 {
                                let palette_index = section.get_block_palette_index(x, y, z);
                                if palette_index >= palette_cache.len() { continue; }
                                let info = &palette_cache[palette_index];

                                if info.properties.is_air { continue; }

                                if info.properties.light_intensity > 0.0 {
                                    let mut light_radius = info.properties.light_radius;
                                    if info.properties.light_intensity > 0.9 {
                                        light_radius = 15.0;
                                    }

                                    lights.push(ExtractedLight {
                                        x: (chunk.x * 16 + x as i32) as f32 + 0.5,
                                        y: (section_y * 16 + y as i32) as f32 + 0.5,
                                        z: (chunk.z * 16 + z as i32) as f32 + 0.5,
                                        r: info.properties.light_color[0],
                                        g: info.properties.light_color[1],
                                        b: info.properties.light_color[2],
                                        intensity: info.properties.light_intensity,
                                        radius: light_radius,
                                    });
                                }
                            }
                        }
                    }
                    continue;
                }

                let mut section_opaque = Vec::new();
                let mut section_opaque_indices = Vec::new();
                let mut section_decal = Vec::new();
                let mut section_decal_indices = Vec::new();
                let mut section_translucent = Vec::new();
                let mut section_translucent_indices = Vec::new();

                let (
                    opaque_buffer,
                    opaque_index_buffer,
                    decal_buffer,
                    decal_index_buffer,
                    translucent_buffer,
                    translucent_index_buffer,
                ) = if include_legacy_output {
                    (
                        &mut *opaque,
                        &mut *opaque_indices,
                        &mut *decal,
                        &mut *decal_indices,
                        &mut *translucent,
                        &mut *translucent_indices,
                    )
                } else {
                    (
                        &mut section_opaque,
                        &mut section_opaque_indices,
                        &mut section_decal,
                        &mut section_decal_indices,
                        &mut section_translucent,
                        &mut section_translucent_indices,
                    )
                };

                let opaque_start = opaque_buffer.len();
                let opaque_index_start = opaque_index_buffer.len();
                let decal_start = decal_buffer.len();
                let decal_index_start = decal_index_buffer.len();
                let translucent_start = translucent_buffer.len();
                let translucent_index_start = translucent_index_buffer.len();

                // 3. 先走 greedy meshing，批量合并标准 full cube 面。
                mesh_section_greedy(
                    opaque_buffer, opaque_index_buffer,
                    decal_buffer, decal_index_buffer,
                    &neighborhood, section_y, section, 
                    &palette_cache,
                    &chunk_props_cache,
                    manager,
                    options,
                );

                let section_ctx = SectionContext::new(&mesh_ctx, section, section_y, &palette_cache);
                let router = PassRouter::new(&section_ctx);

                for y in 0..16 {
                    for z in 0..16 {
                        for x in 0..16 {
                            let palette_index = section.get_block_palette_index(x, y, z);
                            if palette_index >= palette_cache.len() { continue; }
                            let info = &palette_cache[palette_index];
                            
                            if info.properties.is_air { continue; }
                            
                            // greedy 只处理基础立方体面；overlay 元素仍需逐块补发，避免丢失染色层。
                            let greedy_handled = crate::mesher::greedy::is_standard_full_cube(info);
                            if greedy_handled {
                                if info.properties.light_intensity > 0.0 {
                                    // 发光方块即便几何已被 greedy 吃掉，仍需保留点光源记录。
                                    
                                    // Actually CachedBlockProperties in registry.rs does NOT have emission_radius field.
                                    // It only has emission_value (intensity).
                                    // So we must rely on intensity * 15.0 or re-parse flags.
                                    // But CachedBlockProperties stores `flags` implicitly? No.
                                    
                                    // Wait, let's fix the root cause. 
                                    // generator.rs calculates radius.
                                    let mut light_radius = info.properties.light_radius;
                                    
                                    // Increase radius for very bright sources to prevent hard cutoffs
                                    if info.properties.light_intensity > 0.9 {
                                        light_radius = 15.0;
                                    }

                                    lights.push(ExtractedLight {
                                        x: (chunk.x * 16 + x as i32) as f32 + 0.5,
                                        y: (section_ctx.base_y + y as i32) as f32 + 0.5,
                                        z: (chunk.z * 16 + z as i32) as f32 + 0.5,
                                        r: info.properties.light_color[0],
                                        g: info.properties.light_color[1],
                                        b: info.properties.light_color[2],
                                        intensity: info.properties.light_intensity,
                                        radius: light_radius,
                                    });
                                }
                                emit_overlay_elements(
                                    &section_ctx,
                                    router.neighbors(),
                                    &mut cache,
                                    decal_buffer,
                                    decal_index_buffer,
                                    translucent_buffer,
                                    translucent_index_buffer,
                                    info,
                                    x as i32,
                                    y as i32,
                                    z as i32,
                                );
                                // Base cube already handled by greedy mesher.
                                continue;
                            }

                            block_count += 1;

                            // 收集发光方块数据
                            if info.properties.light_intensity > 0.0 {
                                // Default radius calculation: intensity * 15
                                // Adjust this factor to change global light falloff
                                let mut light_radius = info.properties.light_radius;
                                
                                // Increase radius for very bright sources to prevent hard cutoffs
                                if info.properties.light_intensity > 0.9 {
                                    light_radius = 15.0;
                                }

                                lights.push(ExtractedLight {
                                    x: (chunk.x * 16 + x as i32) as f32 + 0.5,
                                    y: (section_ctx.base_y + y as i32) as f32 + 0.5,
                                    z: (chunk.z * 16 + z as i32) as f32 + 0.5,
                                    r: info.properties.light_color[0],
                                    g: info.properties.light_color[1],
                                    b: info.properties.light_color[2],
                                    intensity: info.properties.light_intensity,
                                    radius: light_radius,
                                });
                            }

                            let global_x = chunk.x * 16 + x as i32;
                            let global_y = section_ctx.base_y + y as i32;
                            let global_z = chunk.z * 16 + z as i32;

                            // Fluids are procedurally meshed on the hot path (no static model).
                            {
                                let mut buffers = PassBuffers {
                                    opaque: opaque_buffer,
                                    opaque_indices: opaque_index_buffer,
                                    decal: decal_buffer,
                                    decal_indices: decal_index_buffer,
                                    translucent: translucent_buffer,
                                    translucent_indices: translucent_index_buffer,
                                };
                                if router.emit_pure_fluid(&mut buffers, info, x as i32, y as i32, z as i32) {
                                    continue;
                                }
                                if info.properties.is_water_filled {
                                    router.emit_waterlogged(&mut buffers, info, x as i32, y as i32, z as i32);
                                }
                            }

                            // 获取模型：缓存 > 即时获取
                            let model_rc: Rc<BlockModel>;
                            let model_ref: &Rc<BlockModel> = if let Some(m) = &info.model {
                                model_rc = m.clone();
                                &model_rc
                            } else if let Some(m) = fetch_cached_model(&mut cache, manager, info.id, global_x, global_y, global_z) {
                                model_rc = m;
                                &model_rc
                            } else {
                                if missing_models.len() < 10 {
                                    missing_models.insert(info.properties.name.to_string());
                                }
                                continue;
                            };

                            // 根据渲染层选择输出 Buffer（部分特殊方块可按 face 细分）
                            let default_is_translucent = info.properties.render_layer == 3;
                            
                            // 生成所有面的顶点
                            for element in &model_ref.elements {
                                for (dir_idx, face_opt) in element.faces.iter().enumerate() {
                                    if let Some(face) = face_opt {
                                        // New Buffer Selection Logic:
                                        // Priority:
                                        // 1. Element-specific Render Type (if present)
                                        // 2. Global Block Render Type
                                        let element_layer = element.render_layer; 
                                        
                                        let use_translucent = if let Some(el_layer) = element_layer {
                                            el_layer == 3 // Translucent layer
                                        } else {
                                            default_is_translucent
                                        };

                                        // Cutout/Decal Logic
                                        let use_decal = !use_translucent && (
                                            element_layer.map(|l| l == 1 || l == 2 || l == 4).unwrap_or(false) || // Element overrides (Cutout/Mipped/Decal)
                                            (element_layer.is_none() && ( // Fallback to block props if no element override
                                                info.properties.render_layer == 1 || 
                                                info.properties.render_layer == 2 || 
                                                info.properties.is_decal
                                            ))
                                        );

                                        let (target_buf, target_indices): (&mut Vec<u8>, &mut Vec<u32>) = 
                                            if use_translucent {
                                                (translucent_buffer, translucent_index_buffer)
                                            } else if use_decal {
                                                (decal_buffer, decal_index_buffer)
                                            } else {
                                                (opaque_buffer, opaque_index_buffer)
                                            };
                                        
                                        // Push vertices to target buffer
                                        add_face(
                                            target_buf,
                                            target_indices,
                                            manager,
                                            &mut cache,
                                            &section_ctx,
                                            router.neighbors(),
                                            x as f32,
                                            (section_ctx.base_y + y as i32) as f32,
                                            z as f32,
                                            element,
                                            dir_idx,
                                            face,
                                            info,
                                            x as i32,
                                            y as i32,
                                            z as i32,
                                            options,
                                        );
                                    }
                                }
                            }
                        }
                    }
                }

                if include_legacy_output {
                    let opaque_delta = &opaque_buffer[opaque_start..];
                    let opaque_index_delta = &opaque_index_buffer[opaque_index_start..];
                    let decal_delta = &decal_buffer[decal_start..];
                    let decal_index_delta = &decal_index_buffer[decal_index_start..];
                    let translucent_delta = &translucent_buffer[translucent_start..];
                    let translucent_index_delta = &translucent_index_buffer[translucent_index_start..];
                    let opaque_base_vertex = (opaque_start / encoder.vertex_stride()) as u32;
                    let decal_base_vertex = (decal_start / encoder.vertex_stride()) as u32;
                    let translucent_base_vertex = (translucent_start / encoder.vertex_stride()) as u32;

                    let has_section_geometry = !opaque_delta.is_empty()
                        || !decal_delta.is_empty()
                        || !translucent_delta.is_empty();

                    if has_section_geometry {
                        artifact_writer.begin_section(chunk.x, section_y, chunk.z);

                        if !opaque_delta.is_empty() {
                            let rebased_opaque_indices: Vec<u32> = opaque_index_delta
                                .iter()
                                .map(|index| index.saturating_sub(opaque_base_vertex))
                                .collect();
                            artifact_writer.push_raw_pass(
                                MeshPass::Opaque,
                                encoder.layout_id(),
                                encoder.vertex_stride() as u32,
                                opaque_delta,
                                &rebased_opaque_indices,
                            );
                        }

                        if !decal_delta.is_empty() {
                            let rebased_decal_indices: Vec<u32> = decal_index_delta
                                .iter()
                                .map(|index| index.saturating_sub(decal_base_vertex))
                                .collect();
                            artifact_writer.push_raw_pass(
                                MeshPass::Decal,
                                encoder.layout_id(),
                                encoder.vertex_stride() as u32,
                                decal_delta,
                                &rebased_decal_indices,
                            );
                        }

                        if !translucent_delta.is_empty() {
                            let rebased_translucent_indices: Vec<u32> = translucent_index_delta
                                .iter()
                                .map(|index| index.saturating_sub(translucent_base_vertex))
                                .collect();
                            artifact_writer.push_raw_pass(
                                MeshPass::Translucent,
                                encoder.layout_id(),
                                encoder.vertex_stride() as u32,
                                translucent_delta,
                                &rebased_translucent_indices,
                            );
                        }

                        artifact_writer.end_section();
                    }
                } else {
                    let has_section_geometry = !section_opaque.is_empty()
                        || !section_decal.is_empty()
                        || !section_translucent.is_empty();

                    if has_section_geometry {
                        artifact_writer.begin_section(chunk.x, section_y, chunk.z);

                        if !section_opaque.is_empty() {
                            artifact_writer.push_owned_pass(
                                MeshPass::Opaque,
                                encoder.layout_id(),
                                encoder.vertex_stride() as u32,
                                section_opaque,
                                section_opaque_indices,
                            );
                        }

                        if !section_decal.is_empty() {
                            artifact_writer.push_owned_pass(
                                MeshPass::Decal,
                                encoder.layout_id(),
                                encoder.vertex_stride() as u32,
                                section_decal,
                                section_decal_indices,
                            );
                        }

                        if !section_translucent.is_empty() {
                            artifact_writer.push_owned_pass(
                                MeshPass::Translucent,
                                encoder.layout_id(),
                                encoder.vertex_stride() as u32,
                                section_translucent,
                                section_translucent_indices,
                            );
                        }

                        artifact_writer.end_section();
                    }
                }
            }
        
            if block_count > 0 && !missing_models.is_empty() {
                crate::dev_warn!("Missing models (first 10): {:?}", missing_models);
            }

            let opaque_vec = if include_legacy_output { opaque.to_vec() } else { Vec::new() };
            let opaque_idx = if include_legacy_output {
                opaque_indices.to_vec()
            } else {
                Vec::new()
            };
            let decal_vec = if include_legacy_output { decal.to_vec() } else { Vec::new() };
            let decal_idx = if include_legacy_output {
                decal_indices.to_vec()
            } else {
                Vec::new()
            };
            let translucent_vec = if include_legacy_output {
                translucent.to_vec()
            } else {
                Vec::new()
            };
            let translucent_idx = if include_legacy_output {
                translucent_indices.to_vec()
            } else {
                Vec::new()
            };
            let artifact = artifact_writer.finish();

            MeshChunkOutputs {
                opaque: opaque_vec,
                opaque_indices: opaque_idx,
                decal: decal_vec,
                decal_indices: decal_idx,
                translucent: translucent_vec,
                translucent_indices: translucent_idx,
                lights,
                artifact,
            }
        })
    })
}
