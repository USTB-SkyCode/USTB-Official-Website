//! # Mesher Artifact 汇总模块 (Artifacts Root)
//!
//! ## 职责
//! 聚合网格生成后的中间产物与导出结构，包括 draw、mesh artifact 与 section artifact。

pub mod draw;
pub mod mesh_artifact;
pub mod section_artifact;

pub use draw::*;
pub use mesh_artifact::*;
pub use section_artifact::*;