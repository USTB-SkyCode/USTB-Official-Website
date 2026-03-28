//! # 网格编码模块根 (Encoding Root)
//!
//! ## 职责
//! 提供网格顶点与索引的编码规则，包括 terrain compact 编码与统一的 quad 索引约定。

pub mod encoder;
pub mod terrain_compact;

pub use encoder::*;
pub use terrain_compact::*;

/// 标准 CCW 四边形索引模式。
/// 两个三角形共享 V0->V2 对角线，满足 WebGL2 默认 front-face=CCW 的约定。
pub const QUAD_INDICES_CCW: [u32; 6] = [0, 2, 1, 0, 3, 2];