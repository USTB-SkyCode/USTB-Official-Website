//! # 模型解析器 (Model Resolver)
//!
//! ## 职责 (Responsibility)
//! 负责运行时计算特定 BlockState 下的最终几何模型。处理 BlockState 的 `multipart` 逻辑、随机权重 (`weighted random`) 和属性条件 (`when`)。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入: Block Name, Properties, Position (用于随机种子)。
//! - 输出: `std::rc::Rc<BlockModel>` (缓存的模型实例)。
//!
//! ## MC 机制 (MC Mechanism)
//! - Weighted Models: 草丛、石头的随机旋转变体。
//! - Multipart: 栅栏、红石线的动态拼接模型。
//! - UV Lock: 旋转模型时保持纹理方向。

use super::BlockModelManager;
use crate::domain::block::model::{BlockModel, ModelElement, ModelFace};
use crate::domain::block::def::*;
use crate::utils::{closest_axis, rotate_point};
use std::cell::RefCell;
use std::collections::HashMap;

use super::evaluator::{matches_rule, pick_weighted};
use super::culling::{compute_cull_mask, rotate_masks, rotate_masks_16};

// 用于记录缺失资源的线程局部缓存
thread_local! {
    static MISSING_BLOCKS: RefCell<std::collections::HashSet<String>> = RefCell::new(std::collections::HashSet::new());
    static MISSING_PATTERNS: RefCell<std::collections::HashSet<String>> = RefCell::new(std::collections::HashSet::new());
    static EMPTY_ELEMENTS: RefCell<std::collections::HashSet<String>> = RefCell::new(std::collections::HashSet::new());
}

impl BlockModelManager {
    /// 获取方块模型（如果存在）。
    pub fn get_model(&self, name: &str, properties: &HashMap<String, String>, x: i32, y: i32, z: i32) -> Option<std::rc::Rc<BlockModel>> {
        self.get_model_and_mask(name, properties, x, y, z).0
    }

    /// 获取方块模型及其剔除掩码。
    pub fn get_model_and_mask(&self, name: &str, properties: &HashMap<String, String>, x: i32, y: i32, z: i32) -> (Option<std::rc::Rc<BlockModel>>, [u64; 6]) {
        let mut props_vec: Vec<_> = properties.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        props_vec.sort_unstable_by(|a, b| a.0.cmp(&b.0));
        let id = self.get_or_create_id(name, props_vec);
        
        if let Some(props) = self.get_properties_by_id(id) {
            if props.has_variants {
                let key = name.strip_prefix("minecraft:").unwrap_or(name);
                let states = self.block_states_registry.borrow();
                let compact = states.get(id as usize);
                let model = compact.and_then(|s| self.compute_model(key, s, x, y, z));
                let mask = if let Some(m) = &model {
                    m.masks
                } else {
                    props.masks
                };
                (model.map(std::rc::Rc::new), mask)
            } else {
                (self.get_model_by_id(id), props.masks)
            }
        } else {
            (None, [0; 6])
        }
    }

    /// 根据模型几何体动态计算剔除掩码。
    pub fn compute_cull_mask(&self, model: &BlockModel) -> i32 {
        compute_cull_mask(model)
    }

    pub(crate) fn compute_model(&self, key: &str, properties: &crate::domain::block::registry::CompactBlockState, x: i32, y: i32, z: i32) -> Option<BlockModel> {
        let block_def = match self.blocks.get(key) {
            Some(b) => b,
            None => {
                return None;
            }
        };

        let pattern_def = match self.patterns.get(&block_def.pattern) {
            Some(p) => p,
            None => {
                return None;
            }
        };
        
        // 优化: 预估 elements 容量，避免反复 realloc
        // 大多数方块只有 1-6 个 element，预分配 8 个足够覆盖 99% 的情况
        let mut elements = Vec::with_capacity(8);
        let mut masks = [0u64; 6];
        let mut masks16 = [0u64; 24];
        let mut mask_res: u8 = 0;
        let mut emission: Option<[u8; 4]> = None;

        for rule in &pattern_def.rules {
            if matches_rule(self, rule, pattern_def, properties) {
                if let Some(apply) = pick_weighted(&rule.apply, x, y, z) {
                    if let Some(slot) = block_def.slots.get(apply.slot as usize) {
                        // Aggregate slot emissions (choose brightest)
                        if let Some(e) = slot.emission {
                            match emission {
                                Some(existing) => {
                                    if e[3] > existing[3] {
                                        emission = Some(e);
                                    }
                                }
                                None => {
                                    emission = Some(e);
                                }
                            }
                        }

                        if let Some(template) = self.templates.get(&slot.template) {
                            self.apply_template(template, slot, apply, &mut elements, &mut masks, &mut masks16, &mut mask_res);
                        }
                    }
                }
            }
        }

        if elements.is_empty() {
            return None;
        }

        Some(BlockModel {
            elements,
            masks,
            masks16: if mask_res != 0 { Some(masks16) } else { None },
            mask_res,
            emission,
        })
    }

    fn apply_template(
        &self,
        template: &TemplateDef,
        slot: &SlotDef,
        apply: &ApplyDef,
        out_elements: &mut Vec<ModelElement>,
        out_masks: &mut [u64; 6],
        out_masks16: &mut [u64; 24],
        out_mask_res: &mut u8,
    ) {
        let rx_rad = apply.x.map(|rx| (-rx).to_radians());
        let ry_rad = apply.y.map(|ry| (-ry).to_radians());
        
        for elem in &template.elements {
            let mut corners = [
                elem.from,
                [elem.to[0], elem.from[1], elem.from[2]],
                [elem.from[0], elem.to[1], elem.from[2]],
                [elem.to[0], elem.to[1], elem.from[2]],
                [elem.from[0], elem.from[1], elem.to[2]],
                [elem.to[0], elem.from[1], elem.to[2]],
                [elem.from[0], elem.to[1], elem.to[2]],
                elem.to,
            ];

            let elem_rot_info = elem.rotation.as_ref().map(|r| (r.axis, r.angle.to_radians(), r.origin));

            if let Some((axis, angle, origin)) = elem_rot_info {
                for p in &mut corners { *p = rotate_point(*p, origin, axis, angle); }
            }
            if let Some(r) = rx_rad {
                for p in &mut corners { *p = rotate_point(*p, [8.0, 8.0, 8.0], 0, r); }
            }
            if let Some(r) = ry_rad {
                for p in &mut corners { *p = rotate_point(*p, [8.0, 8.0, 8.0], 1, r); }
            }

            let mut new_faces: [Option<ModelFace>; 6] = Default::default();
            for (idx, face_opt) in elem.faces.iter().enumerate() {
                if let Some(face) = face_opt {
                    let tex_id = if face.texture >= 0 {
                        slot.textures.get(face.texture as usize).cloned().unwrap_or(0)
                    } else {
                        -(face.texture + 1)
                    };

                    let mut cull_dir = None;
                    let mut is_boundary = false;

                    if let Some(cull_idx) = face.cullface {
                        let cull_dir_idx = cull_idx as usize;
                        let mut normal = match cull_dir_idx {
                            0 => [0.0, 1.0, 0.0],
                            1 => [0.0, -1.0, 0.0],
                            2 => [0.0, 0.0, -1.0],
                            3 => [0.0, 0.0, 1.0],
                            4 => [-1.0, 0.0, 0.0],
                            5 => [1.0, 0.0, 0.0],
                            _ => [0.0, 1.0, 0.0],
                        };

                        if let Some((axis, angle, _)) = elem_rot_info {
                            normal = rotate_point(normal, [0.0, 0.0, 0.0], axis, angle);
                        }
                        if let Some(r) = rx_rad {
                            normal = rotate_point(normal, [0.0, 0.0, 0.0], 0, r); 
                        }
                        if let Some(r) = ry_rad {
                            normal = rotate_point(normal, [0.0, 0.0, 0.0], 1, r);
                        }
                        
                        let cd = closest_axis(normal);
                        cull_dir = Some(cd);

                        const EPSILON: f32 = 0.01;
                        is_boundary = match cd {
                            0 => corners.iter().any(|c| c[1] > 16.0 - EPSILON),
                            1 => corners.iter().any(|c| c[1] < EPSILON),
                            2 => corners.iter().any(|c| c[2] < EPSILON),
                            3 => corners.iter().any(|c| c[2] > 16.0 - EPSILON),
                            4 => corners.iter().any(|c| c[0] < EPSILON),
                            5 => corners.iter().any(|c| c[0] > 16.0 - EPSILON),
                            _ => false,
                        };
                    }

                    new_faces[idx] = Some(ModelFace {
                        texture: tex_id,
                        uv: face.get_uv(),
                        cullface: face.cullface,
                        tintindex: Some(face.tintindex),
                        rotation: Some(face.rotation),
                        cull_dir,
                        is_boundary,
                    });
                }
            }

            out_elements.push(ModelElement {
                from: elem.from,
                to: elem.to,
                faces: new_faces,
                rotation: elem.rotation.clone(),
                x: apply.x,
                y: apply.y,
                uvlock: apply.uvlock,
                render_layer: elem.render_layer,
            });
        }

        let rx = apply.x.unwrap_or(0.0);
        let ry = apply.y.unwrap_or(0.0);
        
        if rx == 0.0 && ry == 0.0 {
            for i in 0..6 {
                out_masks[i] |= template.masks[i];
            }

            if template.mask_res != 0 {
                *out_mask_res |= template.mask_res;
                if let Some(m16) = &template.masks16 {
                    for i in 0..24 {
                        out_masks16[i] |= m16[i];
                    }
                }
            }
        } else {
            rotate_masks(template.masks, rx, ry, out_masks);
            if template.mask_res != 0 {
                rotate_masks_16(template, rx, ry, out_masks16, out_mask_res);
            }
        }
    }
}
