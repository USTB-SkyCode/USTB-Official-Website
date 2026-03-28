//! # 工具模块 (Utils)
//!
//! ## 职责 (Responsibility)
//! 提供通用的数学计算、日志记录（兼容 WASM/Native）、以及常用的辅助宏或函数。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入: 基础数据类型（坐标、角度等）。
//! - 输出: 计算后的结果或控制台副作用。
//!
//! ## MC 机制 (MC Mechanism)
//! 无特定 MC 机制，主要是数学工具（如向量旋转）。

use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

static DEV_LOGGING_ENABLED: AtomicBool = AtomicBool::new(cfg!(debug_assertions) || cfg!(feature = "dev-logging"));

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn console_log(s: &str);

    #[wasm_bindgen(js_namespace = console, js_name = warn)]
    fn console_warn(s: &str);
}

#[cfg(target_arch = "wasm32")]
fn emit_log(s: &str) {
    console_log(s);
}

#[cfg(not(target_arch = "wasm32"))]
fn emit_log(s: &str) {
    println!("{}", s);
}

#[cfg(target_arch = "wasm32")]
fn emit_warn(s: &str) {
    console_warn(s);
}

#[cfg(not(target_arch = "wasm32"))]
fn emit_warn(s: &str) {
    eprintln!("WARN: {}", s);
}

/// 设置是否允许开发期日志输出。
pub fn set_dev_logging_enabled(enabled: bool) {
    DEV_LOGGING_ENABLED.store(enabled, Ordering::Relaxed);
}

/// 检查当前是否允许开发期日志输出。
pub fn is_dev_logging_enabled() -> bool {
    DEV_LOGGING_ENABLED.load(Ordering::Relaxed)
}

/// 输出标准日志。
pub fn log(s: &str) {
    emit_log(s);
}

/// 输出警告日志。
pub fn warn(s: &str) {
    emit_warn(s);
}

/// 开发期日志宏，仅在 debug 或 dev-logging 特性开启且运行期使能时有效。
#[macro_export]
macro_rules! dev_log {
    ($($arg:tt)*) => {{
        #[cfg(any(debug_assertions, feature = "dev-logging"))]
        {
            if $crate::utils::is_dev_logging_enabled() {
                $crate::utils::log(&format!($($arg)*));
            }
        }
    }};
}

/// 开发期警告宏。
#[macro_export]
macro_rules! dev_warn {
    ($($arg:tt)*) => {{
        #[cfg(any(debug_assertions, feature = "dev-logging"))]
        {
            if $crate::utils::is_dev_logging_enabled() {
                $crate::utils::warn(&format!($($arg)*));
            }
        }
    }};
}

/// 运行时强制警告宏。
#[macro_export]
macro_rules! runtime_warn {
    ($($arg:tt)*) => {{
        $crate::utils::warn(&format!($($arg)*));
    }};
}

/// 绕指定轴旋转点（任意角度）。
/// # Parameters
/// - `p`: 待旋转点坐标 [x, y, z]
/// - `origin`: 旋转中心坐标 [ox, oy, oz]
/// - `axis`: 旋转轴 (0=x, 1=y, 2=z)
/// - `angle`: 弧度制角度 (Radian)
///
/// # Returns
/// 旋转后的坐标 [nx, ny, nz]
pub fn rotate_point(p: [f32; 3], origin: [f32; 3], axis: u8, angle: f32) -> [f32; 3] {
    // 角度极小时跳过计算
    if angle.abs() < 1e-6 { return p; }

    // 快速路径：对 90 度倍数进行整数优化
    let snapped_90 = (angle / (std::f32::consts::PI / 2.0)).round() as i32;
    if (angle - (snapped_90 as f32 * std::f32::consts::PI / 2.0)).abs() < 1e-5 {
        return rotate_point_90(p, origin, axis, (snapped_90 % 4 + 4) % 4 * 90);
    }

    let (px, py, pz) = (p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
    let (sin, cos) = angle.sin_cos();
    let (nx, ny, nz) = match axis {
        0 => (px, py * cos - pz * sin, py * sin + pz * cos),
        1 => (px * cos + pz * sin, py, -px * sin + pz * cos),
        2 => (px * cos - py * sin, px * sin + py * cos, pz),
        _ => (px, py, pz),
    };
    [nx + origin[0], ny + origin[1], nz + origin[2]]
}

/// 绕指定轴旋转点（90度倍数优化版）。
///
/// # Parameters
/// - `p`: 待旋转点坐标
/// - `origin`: 旋转中心
/// - `axis`: 旋转轴 (0=x, 1=y, 2=z)
/// - `rot`: 角度 (90, 180, 270)
///
/// # Note
/// 避免浮点三角函数计算，直接交换坐标分量，提升性能并消除浮点漂移。
pub fn rotate_point_90(p: [f32; 3], origin: [f32; 3], axis: u8, rot: i32) -> [f32; 3] {
    let (px, py, pz) = (p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]);
    
    let (nx, ny, nz) = match (axis, rot) {
        (0, 90) => (px, -pz, py),
        (0, 180) => (px, -py, -pz),
        (0, 270) => (px, pz, -py),
        
        (1, 90) => (pz, py, -px),
        (1, 180) => (-px, py, -pz),
        (1, 270) => (-pz, py, px),
        
        (2, 90) => (-py, px, pz),
        (2, 180) => (-px, -py, pz),
        (2, 270) => (py, -px, pz),
        
        _ => (px, py, pz),
    };
    
    [nx + origin[0], ny + origin[1], nz + origin[2]]
}

/// 计算向量最接近的轴向索引。
///
/// # Parameters
/// - `vec`: 输入三维向量
///
/// # Returns
/// MC 风格方向索引：0=Up, 1=Down, 2=North, 3=South, 4=West, 5=East
///
/// # MC Mechanism
/// 注意：MC 原版内部逻辑中 0=Down, 1=Up。此处实现为 0=Up, 1=Down，
/// 在与 JS 侧对接时需注意索引映射一致性。
pub fn closest_axis(vec: [f32; 3]) -> usize {
    let ax = vec[0].abs();
    let ay = vec[1].abs();
    let az = vec[2].abs();
    if ax > ay && ax > az { if vec[0] > 0.0 { 5 } else { 4 } } // east, west
    else if ay > ax && ay > az { if vec[1] > 0.0 { 0 } else { 1 } } // up, down
    else { if vec[2] > 0.0 { 3 } else { 2 } } // south, north
}
