//! # Mesher 上下文缓存 (Mesher Context)
//!
//! ## 职责
//! 为单次 Chunk 网格生成准备可复用的上下文，包括邻域引用、Section palette 缓存，以及 Block 属性快照。
//!
//! ## 输入/输出
//! - 输入：`ChunkData`、`BlockModelManager`、邻域结构与 mesher 选项。
//! - 输出：供各个 meshing pass 直接读取的 `MeshContext` / `SectionContext` / palette cache。

use crate::io::anvil::section::ChunkSection;
use crate::io::anvil::chunk::ChunkData;
use crate::domain::block::{BlockModelManager, CachedBlockProperties};
use crate::mesher::types::{CachedBlockInfo, MesherOptions, Neighborhood};

/// Chunk 级别的只读 meshing 上下文。
/// 该结构聚合邻域、属性缓存与 manager 句柄，避免深层函数携带过多参数。
pub struct MeshContext<'a> {
    pub neighborhood: &'a Neighborhood<'a>,
    pub chunk_props_cache: &'a [Option<Vec<CachedBlockProperties>>],
    pub manager: &'a BlockModelManager,
    pub options: MesherOptions,
}

/// Section 级别的局部上下文。
/// `base_y = section_y * 16`，用于把 Section 内局部坐标还原到 Chunk 世界 Y。
pub struct SectionContext<'a> {
    pub ctx: &'a MeshContext<'a>,
    pub section: &'a ChunkSection,
    pub section_y: i32,
    pub base_y: i32,
    pub palette: &'a [CachedBlockInfo],
}

impl<'a> SectionContext<'a> {
    /// 构造单个 Section 的局部上下文。
    /// `section_y` 为 Section 坐标而非块坐标，因此 base_y 要乘 16。
    pub fn new(
        ctx: &'a MeshContext<'a>,
        section: &'a ChunkSection,
        section_y: i32,
        palette: &'a [CachedBlockInfo],
    ) -> Self {
        Self {
            ctx,
            section,
            section_y,
            base_y: section_y * 16,
            palette,
        }
    }
}

/// 预计算整个 Chunk 的 palette 属性缓存。
/// 每个 Section 的 palette 只解析一次，后续 block 迭代通过 palette index 直接查表。
pub fn prepare_chunk_properties(chunk: &ChunkData, manager: &BlockModelManager) -> Vec<Option<Vec<CachedBlockProperties>>> {
    let mut chunk_props_cache: Vec<Option<Vec<CachedBlockProperties>>> = Vec::with_capacity(chunk.sections.len());
    for section_opt in chunk.sections.iter() {
        chunk_props_cache.push(section_opt.as_ref().map(|section| {
            // palette 大小已知，提前预分配可避免 Section 热路径重复扩容。
            let mut props = Vec::with_capacity(section.palette.len());
            for &id in section.palette.iter() {
                props.push(match manager.get_properties_by_id(id) {
                    Some(p) => p.clone(),
                    None => CachedBlockProperties {
                        render_layer: 0,
                        cull_mask: 0,
                        masks: [0; 6],
                        masks16: None,
                        mask_res: 0,
                        is_air: true,
                        block_key_id: 0,
                        emissive_intensity: 0.0,
                        emissive_color: [0.0, 0.0, 0.0],
                        light_intensity: 0.0,
                        light_color: [0.0, 0.0, 0.0],
                        light_radius: 0.0,
                        translucent_material_id: 0,
                        has_variants: false,
                        name: std::rc::Rc::new("invalid".to_string()),
                        is_full_cube: false,
                        has_overlay_elements: false,
                        is_lab_pbr: false,
                        is_state_dependent_light: false,
                        is_water_filled: false,
                        is_lava: false,
                        is_water_cauldron: false,
                        is_lava_cauldron: false,
                        is_random_texture: false,
                        is_opaque_full_cube: false,
                        is_decal: false,
                    },
                });
            }
            props
        }));
    }
    chunk_props_cache
}

/// 组装单个 Section 的 `CachedBlockInfo` 列表。
/// 对无随机变体的方块直接缓存 model 指针，减少 block 迭代中的 manager 查询。
pub fn prepare_section_palette(
    section: &ChunkSection,
    section_props_opt: Option<&Vec<CachedBlockProperties>>,
    manager: &BlockModelManager,
) -> Vec<CachedBlockInfo> {
    let palette_len = section.palette.len();
    let mut palette_cache: Vec<CachedBlockInfo> = Vec::with_capacity(palette_len);
    for (i, &id) in section.palette.iter().enumerate() {
        let props = match section_props_opt.and_then(|v| v.get(i)) {
            Some(p) => p.clone(),
            None => CachedBlockProperties {
                render_layer: 0,
                cull_mask: 0,
                masks: [0; 6],
                masks16: None,
                mask_res: 0,
                is_air: true,
                block_key_id: 0,
                emissive_intensity: 0.0,
                emissive_color: [0.0, 0.0, 0.0],
                light_intensity: 0.0,
                light_color: [0.0, 0.0, 0.0],
                light_radius: 0.0,
                translucent_material_id: 0,
                has_variants: false,
                name: std::rc::Rc::new("error".to_string()),
                is_full_cube: false,
                is_opaque_full_cube: false,
                has_overlay_elements: false,
                is_lab_pbr: false,
                is_state_dependent_light: false,
                is_water_filled: false,
                is_lava: false,
                is_water_cauldron: false,
                is_lava_cauldron: false,
                is_random_texture: false,
                is_decal: false,
            },
        };
        
        let model = if props.has_variants && !props.is_random_texture {
            None
        } else {
            manager.get_model_by_id(id)
        };

        palette_cache.push(CachedBlockInfo {
            id,
            model,
            properties: props,
        });
    }
    palette_cache
}