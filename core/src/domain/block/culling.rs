//! # 面遮挡掩码计算 (Culling Masks)
//!
//! ## 职责
//! 计算模板或模型在六个方向上的遮挡掩码，并支持按 90 度步进旋转 8x8 / 16x16 face mask。
//! 这些掩码会被 mesher 用于快速面剔除。

use crate::domain::block::model::BlockModel;
use crate::domain::block::{FACE_DOWN, FACE_EAST, FACE_NORTH, FACE_SOUTH, FACE_UP, FACE_WEST};
use crate::domain::block::def::TemplateDef;
use crate::utils::rotate_point_90;

/// 计算一个模型的 6 向粗粒度 cull mask。
/// 仅处理无 `element.rotation` 的元素；x/y 旋转通过角点旋转后重建边界盒做近似。
pub fn compute_cull_mask(model: &BlockModel) -> i32 {
    let mut mask = 0;
    for element in &model.elements {
        if element.rotation.is_some() { continue; }

        let min = element.from;
        let max = element.to;
        
        let mut corners = [
            [min[0], min[1], min[2]],
            [max[0], min[1], min[2]],
            [min[0], max[1], min[2]],
            [max[0], max[1], min[2]],
            [min[0], min[1], max[2]],
            [max[0], min[1], max[2]],
            [min[0], max[1], max[2]],
            [max[0], max[1], max[2]],
        ];

        if let Some(rx) = element.x {
            let rot = ((-rx).round() as i32 % 360 + 360) % 360;
            if rot != 0 {
                for p in &mut corners {
                    *p = rotate_point_90(*p, [8.0, 8.0, 8.0], 0, rot);
                }
            }
        }

        if let Some(ry) = element.y {
            let rot = ((-ry).round() as i32 % 360 + 360) % 360;
            if rot != 0 {
                for p in &mut corners {
                    *p = rotate_point_90(*p, [8.0, 8.0, 8.0], 1, rot);
                }
            }
        }

        let mut new_min = corners[0];
        let mut new_max = corners[0];
        for p in &corners {
            for i in 0..3 {
                if p[i] < new_min[i] { new_min[i] = p[i]; }
                if p[i] > new_max[i] { new_max[i] = p[i]; }
            }
        }

        const EPSILON: f32 = 0.01;
        const MIN: f32 = 0.0;
        const MAX: f32 = 16.0;

        if (new_min[1] - MIN).abs() < EPSILON && (new_min[0] - MIN).abs() < EPSILON && (new_min[2] - MIN).abs() < EPSILON && (new_max[0] - MAX).abs() < EPSILON && (new_max[2] - MAX).abs() < EPSILON { mask |= FACE_DOWN; }
        if (new_max[1] - MAX).abs() < EPSILON && (new_min[0] - MIN).abs() < EPSILON && (new_min[2] - MIN).abs() < EPSILON && (new_max[0] - MAX).abs() < EPSILON && (new_max[2] - MAX).abs() < EPSILON { mask |= FACE_UP; }
        
        if (new_min[2] - MIN).abs() < EPSILON && (new_min[0] - MIN).abs() < EPSILON && (new_min[1] - MIN).abs() < EPSILON && (new_max[0] - MAX).abs() < EPSILON && (new_max[1] - MAX).abs() < EPSILON { mask |= FACE_NORTH; }
        if (new_max[2] - MAX).abs() < EPSILON && (new_min[0] - MIN).abs() < EPSILON && (new_min[1] - MIN).abs() < EPSILON && (new_max[0] - MAX).abs() < EPSILON && (new_max[1] - MAX).abs() < EPSILON { mask |= FACE_SOUTH; }

        if (new_min[0] - MIN).abs() < EPSILON && (new_min[1] - MIN).abs() < EPSILON && (new_min[2] - MIN).abs() < EPSILON && (new_max[1] - MAX).abs() < EPSILON && (new_max[2] - MAX).abs() < EPSILON { mask |= FACE_WEST; }
        if (new_max[0] - MAX).abs() < EPSILON && (new_min[1] - MIN).abs() < EPSILON && (new_min[2] - MIN).abs() < EPSILON && (new_max[1] - MAX).abs() < EPSILON && (new_max[2] - MAX).abs() < EPSILON { mask |= FACE_EAST; }
    }
    mask
}

/// 旋转 8x8 face mask。
/// `src[face]` 表示每个面的位图，旋转后写入 `dst`。
pub fn rotate_masks(src: [u64; 6], rx: f32, ry: f32, dst: &mut [u64; 6]) {
    let rx_steps = (rx / 90.0).round() as i32;
    let ry_steps = (ry / 90.0).round() as i32;

    for (face, &mask) in src.iter().enumerate() {
        if mask == 0 { continue; }
        
        let mut curr_face = face;
        let mut curr_rot = 0;
        
        // X 轴旋转：更新面归属与局部纹理朝向。
        for _ in 0..(rx_steps.rem_euclid(4)) {
            match curr_face {
                0 => { curr_face = 3; curr_rot = (curr_rot + 0) % 4; } // Up->South
                1 => { curr_face = 2; curr_rot = (curr_rot + 2) % 4; } // Down->North
                2 => { curr_face = 0; curr_rot = (curr_rot + 2) % 4; } // North->Up
                3 => { curr_face = 1; curr_rot = (curr_rot + 0) % 4; } // South->Down
                4 => { curr_face = 4; curr_rot = (curr_rot + 1) % 4; } // West spin CW
                5 => { curr_face = 5; curr_rot = (curr_rot + 3) % 4; } // East spin CCW
                _ => {}
            }
        }

        // Y 轴旋转：更新侧面循环与上下表面的局部旋转。
        for _ in 0..(ry_steps.rem_euclid(4)) {
            match curr_face {
                2 => { curr_face = 5; } // North->East
                5 => { curr_face = 3; } // East->South
                3 => { curr_face = 4; } // South->West
                4 => { curr_face = 2; } // West->North
                0 => { curr_rot = (curr_rot + 1) % 4; } // Up spin CW
                1 => { curr_rot = (curr_rot + 3) % 4; } // Down spin CCW
                _ => {}
            }
        }

        let final_mask = if curr_rot == 0 { mask } else {
            let mut m = mask;
             for _ in 0..curr_rot {
                let mut nm = 0;
                for y in 0..8 {
                    for x in 0..8 {
                        if (m & (1 << (y * 8 + x))) != 0 {
                            nm |= 1 << (x * 8 + (7 - y));
                        }
                    }
                }
                m = nm;
            }
            m
        };
        
        dst[curr_face] |= final_mask;
    }
}

/// 旋转 16x16 高精度 face mask。
/// `dst_res` 记录哪些面拥有 16x16 掩码分辨率。
pub fn rotate_masks_16(template: &TemplateDef, rx: f32, ry: f32, dst: &mut [u64; 24], dst_res: &mut u8) {
    let rx_steps = (rx / 90.0).round() as i32;
    let ry_steps = (ry / 90.0).round() as i32;

    let Some(src_masks16) = &template.masks16 else { return; };

    for face in 0..6 {
        let face_bit = 1u8 << face;
        if (template.mask_res & face_bit) == 0 { continue; }

        let mut curr_face = face;
        let mut curr_rot = 0;

        for _ in 0..(rx_steps.rem_euclid(4)) {
            match curr_face {
                0 => { curr_face = 3; curr_rot = (curr_rot + 0) % 4; }
                1 => { curr_face = 2; curr_rot = (curr_rot + 2) % 4; }
                2 => { curr_face = 0; curr_rot = (curr_rot + 2) % 4; }
                3 => { curr_face = 1; curr_rot = (curr_rot + 0) % 4; }
                4 => { curr_face = 4; curr_rot = (curr_rot + 1) % 4; }
                5 => { curr_face = 5; curr_rot = (curr_rot + 3) % 4; }
                _ => {}
            }
        }

        for _ in 0..(ry_steps.rem_euclid(4)) {
            match curr_face {
                2 => { curr_face = 5; }
                5 => { curr_face = 3; }
                3 => { curr_face = 4; }
                4 => { curr_face = 2; }
                0 => { curr_rot = (curr_rot + 1) % 4; }
                1 => { curr_rot = (curr_rot + 3) % 4; }
                _ => {}
            }
        }

        let idx = face * 4;
        let src = [
            src_masks16[idx],
            src_masks16[idx + 1],
            src_masks16[idx + 2],
            src_masks16[idx + 3],
        ];

        let rotated = if curr_rot == 0 { src } else { rotate_mask16(src, curr_rot) };

        let dst_idx = curr_face * 4;
        dst[dst_idx] |= rotated[0];
        dst[dst_idx + 1] |= rotated[1];
        dst[dst_idx + 2] |= rotated[2];
        dst[dst_idx + 3] |= rotated[3];
        *dst_res |= 1u8 << curr_face;
    }
}

/// 以 90 度步进旋转单个 16x16 mask。
fn rotate_mask16(src: [u64; 4], times: i32) -> [u64; 4] {
    let mut out = src;
    for _ in 0..(times.rem_euclid(4)) {
        let mut next = [0u64; 4];
        for row in 0..16 {
            for col in 0..16 {
                let tile = (row / 8) * 2 + (col / 8);
                let idx = (row % 8) * 8 + (col % 8);
                let bit = 1u64 << idx;
                if (out[tile] & bit) == 0 { continue; }

                let new_row = col;
                let new_col = 15 - row;
                let new_tile = (new_row / 8) * 2 + (new_col / 8);
                let new_idx = (new_row % 8) * 8 + (new_col % 8);
                next[new_tile] |= 1u64 << new_idx;
            }
        }
        out = next;
    }
    out
}
