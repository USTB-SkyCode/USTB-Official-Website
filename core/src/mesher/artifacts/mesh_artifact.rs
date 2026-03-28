//! # 单个渲染项 Mesh Artifact (Item Mesh Artifact)
//!
//! ## 职责
//! 描述一个渲染 pass 下的几何产物，包括顶点/索引字节流与分段绘制信息。

use crate::mesher::artifacts::{DrawSegment, MeshPass};

/// 单个渲染项的网格产物。
/// 一个 section 往往会拆成多个 `ItemMeshArtifact`，分别对应 opaque / decal / translucent 等 pass。
#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct ItemMeshArtifact {
    pub item: MeshPass,
    pub layout_id: String,
    pub vertex_stride: u32,
    pub vertex_bytes: Vec<u8>,
    pub index_bytes: Option<Vec<u8>>,
    pub vertex_count: u32,
    pub index_count: u32,
    pub segments: Vec<DrawSegment>,
}