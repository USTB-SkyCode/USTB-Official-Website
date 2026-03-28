//! # 顶点语义定义 (Vertex Semantic)
//!
//! ## 职责
//! 定义 mesher 内部使用的中间顶点语义结构。
//! 这些语义在最终提交前会被 `VertexEncoder` 压缩到具体布局。

/// 单个顶点的中间语义表示。
/// 保持浮点与逻辑字段分离，便于在编码前做光照、染色和材质补充。
#[derive(Clone, Debug, Default)]
pub struct VertexSemantic {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv0: [f32; 2],
    pub color0: [f32; 4],
    pub block_light: f32,
    pub sky_light: f32,
    pub texture_index: i32,
    pub material_id: u8,
    pub extra_u32: u32,
}

/// 一个四边形的中间语义表示。
/// `pass` 与 `facing` 会被 artifact writer 用于切分 DrawSegment。
#[derive(Clone, Debug, Default)]
pub struct QuadSemantic {
    pub vertices: [VertexSemantic; 4],
    pub pass: crate::mesher::artifacts::MeshPass,
    pub facing: crate::mesher::artifacts::QuadFacing,
    pub transparent: bool,
}