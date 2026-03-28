//! # 几何辅助函数 (Geometry Helpers)
//!
//! ## 职责
//! 提供方块面法线、纹理朝向、点旋转与 UV lock 所需的几何计算工具。
//!
//! ## MC 机制
//! `calculate_uvlock` 用于在模型旋转后保持纹理“朝上”方向，行为对齐 Minecraft block model 的 uvlock 概念。

use std::f32::consts::PI;

// 六个标准面法线：up/down/north/south/west/east。
const DIR_NORMALS: [[f32; 3]; 6] = [
    [0.0, 1.0, 0.0],  // up
    [0.0, -1.0, 0.0], // down
    [0.0, 0.0, -1.0], // north
    [0.0, 0.0, 1.0],  // south
    [-1.0, 0.0, 0.0], // west
    [1.0, 0.0, 0.0],  // east
];

// 每个面的“纹理朝上”参考向量。
const TEX_UP: [[f32; 3]; 6] = [
    [0.0, 0.0, -1.0], // up face: texture up points to north
    [0.0, 0.0, 1.0],  // down face: texture up points to south
    [0.0, 1.0, 0.0],  // north
    [0.0, 1.0, 0.0],  // south
    [0.0, 1.0, 0.0],  // west
    [0.0, 1.0, 0.0],  // east
];

/// 以 SoA 形式原地旋转四个顶点。
/// 适合 quad 顶点批量变换，减少 AoS 拆包成本。
pub(crate) fn rotate_points_soa(
    vx: &mut [f32; 4],
    vy: &mut [f32; 4],
    vz: &mut [f32; 4],
    origin: [f32; 3],
    axis: u8,
    angle: f32,
) {
    let (sin, cos) = angle.sin_cos();
    for i in 0..4 {
        vx[i] -= origin[0];
        vy[i] -= origin[1];
        vz[i] -= origin[2];
    }

    match axis {
        0 => { // x 轴旋转
            for i in 0..4 {
                let y = vy[i];
                let z = vz[i];
                vy[i] = y * cos - z * sin;
                vz[i] = y * sin + z * cos;
            }
        }
        1 => { // y 轴旋转
            for i in 0..4 {
                let x = vx[i];
                let z = vz[i];
                vx[i] = x * cos + z * sin;
                vz[i] = -x * sin + z * cos;
            }
        }
        2 => { // z 轴旋转
            for i in 0..4 {
                let x = vx[i];
                let y = vy[i];
                vx[i] = x * cos - y * sin;
                vy[i] = x * sin + y * cos;
            }
        }
        _ => {}
    }

    for i in 0..4 {
        vx[i] += origin[0];
        vy[i] += origin[1];
        vz[i] += origin[2];
    }
}

/// 旋转单个点。
pub(crate) fn rotate_point(p: [f32; 3], origin: [f32; 3], axis: u8, angle: f32) -> [f32; 3] {
    let (px, py, pz) = (p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
    let (sin, cos) = angle.sin_cos();
    let (nx, ny, nz) = match axis {
        0 => { // x 轴旋转
            let ny = py * cos - pz * sin;
            let nz = py * sin + pz * cos;
            (px, ny, nz)
        }
        1 => { // y 轴旋转
            let nx = px * cos + pz * sin;
            let nz = -px * sin + pz * cos;
            (nx, py, nz)
        }
        2 => { // z 轴旋转
            let nx = px * cos - py * sin;
            let ny = px * sin + py * cos;
            (nx, ny, pz)
        }
        _ => (px, py, pz),
    };
    [nx + origin[0], ny + origin[1], nz + origin[2]]
}

#[inline]
/// 读取方向索引对应的法线。
pub(crate) fn dir_vector(dir_idx: usize) -> [f32; 3] {
    *DIR_NORMALS.get(dir_idx).unwrap_or(&DIR_NORMALS[0])
}

#[inline]
/// 读取方向索引对应的纹理朝上向量。
pub(crate) fn texture_up(dir_idx: usize) -> [f32; 3] {
    *TEX_UP.get(dir_idx).unwrap_or(&TEX_UP[0])
}

/// 计算 uvlock 旋转角度。
/// 做法：先旋转法线与 up 向量，再把 up 投影到目标法线平面，最终把角度吸附到 90 度倍数。
pub(crate) fn calculate_uvlock(dir_idx: usize, rx: f32, ry: f32) -> i32 {
    let mut normal = dir_vector(dir_idx);
    let mut up = texture_up(dir_idx);

    normal = rotate_point(normal, [0.0, 0.0, 0.0], 0, rx);
    normal = rotate_point(normal, [0.0, 0.0, 0.0], 1, ry);
    up = rotate_point(up, [0.0, 0.0, 0.0], 0, rx);
    up = rotate_point(up, [0.0, 0.0, 0.0], 1, ry);

    let new_dir_idx = crate::utils::closest_axis(normal);
    let target_up = texture_up(new_dir_idx);
    let new_normal = dir_vector(new_dir_idx);

    let cross = cross3(up, target_up);
    let dot = dot3(up, target_up);
    let angle = cross[0] * new_normal[0] + cross[1] * new_normal[1] + cross[2] * new_normal[2];
    let ang = angle.atan2(dot) * 180.0 / PI;
    let snapped = (ang / 90.0).round() as i32 * 90;
    ((snapped % 360) + 360) % 360
}

/// 三维叉乘。
pub(crate) fn cross3(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

/// 三维点乘。
pub(crate) fn dot3(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
