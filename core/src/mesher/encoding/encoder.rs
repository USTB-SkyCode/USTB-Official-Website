//! # 顶点编码 trait 定义 (Vertex Encoder)
//!
//! ## 职责
//! 抽象 mesher 输出到具体顶点布局字节流的编码过程。
//! 不同布局只需实现本 trait，即可复用上层几何生成流程。

use crate::mesher::semantic::VertexSemantic;

/// 顶点编码器接口。
/// `layout_id` 必须与前端注册的 VertexLayoutDescriptor 保持一致。
pub trait VertexEncoder {
    fn layout_id(&self) -> &'static str;
    fn vertex_stride(&self) -> usize;
    fn index_stride(&self) -> usize;

    /// 把单个 `VertexSemantic` 追加编码到字节缓冲。
    fn encode_vertex(&self, out: &mut Vec<u8>, vertex: &VertexSemantic);

    /// 为一个 quad 追加索引。
    /// `base_vertex` 指向该 quad 第一个顶点在当前批次中的起点。
    fn encode_quad_indices(&self, out: &mut Vec<u8>, base_vertex: u32);
}