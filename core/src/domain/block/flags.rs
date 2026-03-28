//! # BlockModel 标志计算 (Model Flags)
//!
//! ## 职责
//! 从运行时 `BlockModel` 结构中提取快速判定标志，供 mesher 与渲染层走快速路径。
//! 当前关注 `is_full_cube` 与 `has_overlay_elements`。

use crate::domain::block::model::{BlockModel, ModelElement};

/// 由模型结构推导出的快速标志。
pub struct ModelFlags {
    pub is_full_cube: bool,
    pub has_overlay_elements: bool,
}

/// 计算模型标志。
/// 首元素若覆盖完整 0..16 立方体且无旋转，则视作 full cube；多个元素则认为存在 overlay。
pub fn compute_model_flags(model: Option<&BlockModel>) -> ModelFlags {
    let Some(model) = model else {
        return ModelFlags {
            is_full_cube: false,
            has_overlay_elements: false,
        };
    };

    let has_overlay = model.elements.len() > 1;
    let is_full_cube = model
        .elements
        .first()
        .map(is_full_cube_element)
        .unwrap_or(false);

    ModelFlags {
        is_full_cube,
        has_overlay_elements: has_overlay,
    }
}

/// 计算 block 名称的 32-bit FNV-1a 哈希。
/// 用于快速 block identity 判定，避免频繁字符串比较。
pub fn compute_block_key_id(name: &str) -> u32 {
    const FNV_OFFSET: u32 = 2166136261;
    const FNV_PRIME: u32 = 16777619;
    let mut hash = FNV_OFFSET;
    for b in name.as_bytes() {
        hash ^= *b as u32;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

/// 判断单个元素是否构成标准 full cube。
/// 条件为：边界覆盖完整 0..16、无 element rotation、无额外 x/y 旋转。
fn is_full_cube_element(el: &ModelElement) -> bool {
    const EPSILON: f32 = 0.001;

    if (el.from[0]).abs() > EPSILON
        || (el.from[1]).abs() > EPSILON
        || (el.from[2]).abs() > EPSILON
    {
        return false;
    }

    if (el.to[0] - 16.0).abs() > EPSILON
        || (el.to[1] - 16.0).abs() > EPSILON
        || (el.to[2] - 16.0).abs() > EPSILON
    {
        return false;
    }

    if el.rotation.is_some() {
        return false;
    }

    if el.x.unwrap_or(0.0) != 0.0 || el.y.unwrap_or(0.0) != 0.0 {
        return false;
    }

    true
}