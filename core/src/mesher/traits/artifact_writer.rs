//! # Artifact 写入接口 (Artifact Writer)
//!
//! ## 职责
//! 抽象 mesher 把 quad 流写入某种 artifact 结构的过程。
//! `SectionArtifactWriter` 是当前主要实现。

use crate::mesher::artifacts::{MeshPass, QuadFacing};
use crate::mesher::encoding::VertexEncoder;
use crate::mesher::semantic::VertexSemantic;

/// Artifact 写入器接口。
/// 生命周期固定为：`begin_section -> begin_pass -> push_quad* -> end_pass -> end_section`。
pub trait ArtifactWriter {
    fn begin_section(&mut self, chunk_x: i32, section_y: i32, chunk_z: i32);

    fn begin_pass(&mut self, pass: MeshPass, layout_id: &str, vertex_stride: u32);

    fn push_quad(
        &mut self,
        facing: QuadFacing,
        vertices: &[VertexSemantic; 4],
        encoder: &dyn VertexEncoder,
    );

    fn end_pass(&mut self);

    fn end_section(&mut self);
}