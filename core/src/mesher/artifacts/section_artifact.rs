//! # Section / Chunk 构建产物 (Section Artifact)
//!
//! ## 职责
//! 定义 section 级与 chunk 级的网格构建结果，用于把 mesher 中间产物交给前端渲染架构。

use crate::mesher::artifacts::ItemMeshArtifact;
use crate::mesher::ExtractedLight;

/// 单个 section 的网格构建产物。
#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct SectionMeshArtifact {
    pub chunk_x: i32,
    pub section_y: i32,
    pub chunk_z: i32,
    pub build_version: u32,
    pub items: Vec<ItemMeshArtifact>,
    pub bounds_min: [f32; 3],
    pub bounds_max: [f32; 3],
}

/// 单个 chunk 的构建产物。
/// 包含多个 section 产物与从 chunk 中提取出的点光源列表。
#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct ChunkBuildArtifact {
    pub chunk_x: i32,
    pub chunk_z: i32,
    pub sections: Vec<SectionMeshArtifact>,
    pub lights: Vec<ExtractedLight>,
}