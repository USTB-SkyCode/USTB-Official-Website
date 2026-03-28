//! # Section Artifact 写入器 (Section Artifact Writer)
//!
//! ## 职责
//! 把 mesher 逐步产生的 quad / pass / section 数据整理为 `SectionMeshArtifact` 与 `ChunkBuildArtifact`。
//!
//! ## 运行机制
//! - `begin_section` / `begin_pass` 建立当前写入目标。
//! - `push_quad` 通过 `VertexEncoder` 追加顶点与索引。
//! - `flush_pass` / `flush_section` 把暂存数据固化为 artifact。

use crate::mesher::artifacts::{
    ChunkBuildArtifact, DrawSegment, ItemMeshArtifact, MeshPass, QuadFacing, SectionMeshArtifact,
};
use crate::mesher::encoding::VertexEncoder;
use crate::mesher::semantic::VertexSemantic;
use crate::mesher::traits::ArtifactWriter;

/// Section 级 artifact 写入器。
#[derive(Default)]
pub struct SectionArtifactWriter {
    current_chunk_x: i32,
    current_chunk_z: i32,
    current_section: Option<SectionMeshArtifact>,
    current_item: Option<ItemMeshArtifact>,
    sections: Vec<SectionMeshArtifact>,
}

impl SectionArtifactWriter {
    /// 创建空写入器。
    pub fn new() -> Self {
        Self::default()
    }

    /// 结束写入并返回不带光源的 ChunkBuildArtifact。
    pub fn finish(self) -> ChunkBuildArtifact {
        self.finish_with_lights(Vec::new())
    }

    /// 结束写入并附带 lights。
    pub fn finish_with_lights(mut self, lights: Vec<crate::mesher::ExtractedLight>) -> ChunkBuildArtifact {
        self.flush_pass();
        self.flush_section();

        ChunkBuildArtifact {
            chunk_x: self.current_chunk_x,
            chunk_z: self.current_chunk_z,
            sections: self.sections,
            lights,
        }
    }

    /// 直接把现成的 pass 字节流写入当前 section。
    pub fn push_raw_pass(
        &mut self,
        pass: MeshPass,
        layout_id: &str,
        vertex_stride: u32,
        vertex_bytes: &[u8],
        indices: &[u32],
    ) {
        if vertex_bytes.is_empty() {
            return;
        }

        self.flush_pass();

        let index_bytes = if pass_requires_local_index_bytes(pass) {
            let mut index_bytes = Vec::with_capacity(indices.len() * std::mem::size_of::<u32>());
            for index in indices {
                index_bytes.extend_from_slice(&index.to_le_bytes());
            }
            Some(index_bytes)
        } else {
            None
        };

        let vertex_count = if vertex_stride == 0 {
            0
        } else {
            (vertex_bytes.len() as u32) / vertex_stride
        };
        let index_count = indices.len() as u32;

        let mut segments = Vec::new();
        if vertex_count > 0 {
            segments.push(DrawSegment {
                facing: QuadFacing::Unassigned,
                vertex_count,
                first_vertex: 0,
                index_count,
                first_index: 0,
                base_vertex: 0,
            });
        }

        if let Some(section) = self.current_section.as_mut() {
            section.items.push(ItemMeshArtifact {
                item: pass,
                layout_id: layout_id.to_string(),
                vertex_stride,
                vertex_bytes: vertex_bytes.to_vec(),
                index_bytes,
                vertex_count,
                index_count,
                segments,
            });
        }
    }

    /// 把所有权已归当前调用方的 pass 数据移动进 artifact。
    pub fn push_owned_pass(
        &mut self,
        pass: MeshPass,
        layout_id: &str,
        vertex_stride: u32,
        vertex_bytes: Vec<u8>,
        indices: Vec<u32>,
    ) {
        if vertex_bytes.is_empty() {
            return;
        }

        self.flush_pass();

        let vertex_count = if vertex_stride == 0 {
            0
        } else {
            (vertex_bytes.len() as u32) / vertex_stride
        };
        let index_count = indices.len() as u32;
        let index_bytes = if pass_requires_local_index_bytes(pass) {
            Some(indices_into_bytes(indices))
        } else {
            None
        };

        let mut segments = Vec::new();
        if vertex_count > 0 {
            segments.push(DrawSegment {
                facing: QuadFacing::Unassigned,
                vertex_count,
                first_vertex: 0,
                index_count,
                first_index: 0,
                base_vertex: 0,
            });
        }

        if let Some(section) = self.current_section.as_mut() {
            section.items.push(ItemMeshArtifact {
                item: pass,
                layout_id: layout_id.to_string(),
                vertex_stride,
                vertex_bytes,
                index_bytes,
                vertex_count,
                index_count,
                segments,
            });
        }
    }

    /// 把当前 pass 暂存写回当前 section。
    fn flush_pass(&mut self) {
        if let Some(item) = self.current_item.take() {
            if let Some(section) = self.current_section.as_mut() {
                section.items.push(item);
            }
        }
    }

    /// 结束当前 section，并把它推进 sections 列表。
    fn flush_section(&mut self) {
        self.flush_pass();
        if let Some(section) = self.current_section.take() {
            self.sections.push(section);
        }
    }
}

/// 把 `Vec<u32>` 索引零拷贝重解释成 `Vec<u8>`。
fn indices_into_bytes(indices: Vec<u32>) -> Vec<u8> {
    let mut indices = std::mem::ManuallyDrop::new(indices);
    let len = indices.len() * std::mem::size_of::<u32>();
    let cap = indices.capacity() * std::mem::size_of::<u32>();
    let ptr = indices.as_mut_ptr() as *mut u8;

    // WebAssembly 线性内存是 little-endian，直接重解释 u32 索引字节是安全的。
    unsafe { Vec::from_raw_parts(ptr, len, cap) }
}

impl ArtifactWriter for SectionArtifactWriter {
    fn begin_section(&mut self, chunk_x: i32, section_y: i32, chunk_z: i32) {
        self.flush_section();
        self.current_chunk_x = chunk_x;
        self.current_chunk_z = chunk_z;
        self.current_section = Some(SectionMeshArtifact {
            chunk_x,
            section_y,
            chunk_z,
            build_version: 0,
            items: Vec::new(),
            bounds_min: [chunk_x as f32 * 16.0, section_y as f32 * 16.0, chunk_z as f32 * 16.0],
            bounds_max: [
                chunk_x as f32 * 16.0 + 16.0,
                section_y as f32 * 16.0 + 16.0,
                chunk_z as f32 * 16.0 + 16.0,
            ],
        });
    }

    fn begin_pass(&mut self, pass: MeshPass, layout_id: &str, vertex_stride: u32) {
        self.flush_pass();
        self.current_item = Some(ItemMeshArtifact {
            item: pass,
            layout_id: layout_id.to_string(),
            vertex_stride,
            vertex_bytes: Vec::new(),
            index_bytes: pass_requires_local_index_bytes(pass).then(Vec::new),
            vertex_count: 0,
            index_count: 0,
            segments: Vec::new(),
        });
    }

    fn push_quad(
        &mut self,
        facing: QuadFacing,
        vertices: &[VertexSemantic; 4],
        encoder: &dyn VertexEncoder,
    ) {
        let Some(item) = self.current_item.as_mut() else {
            return;
        };

        let first_vertex = item.vertex_count;
        let first_index = item.index_count;

        for vertex in vertices {
            encoder.encode_vertex(&mut item.vertex_bytes, vertex);
            item.vertex_count += 1;
        }

        if let Some(index_bytes) = item.index_bytes.as_mut() {
            encoder.encode_quad_indices(index_bytes, first_vertex);
        }
        item.index_count += 6;

        // 每个 quad 都记录独立 DrawSegment，便于后续按 facing 或材质再聚合。
        item.segments.push(DrawSegment {
            facing,
            vertex_count: 4,
            first_vertex,
            index_count: 6,
            first_index,
            base_vertex: 0,
        });
    }

    fn end_pass(&mut self) {
        self.flush_pass();
    }

    fn end_section(&mut self) {
        self.flush_section();
    }
}

/// opaque / decal 走共享索引缓冲，其余 pass 需要持有本地 index bytes。
fn pass_requires_local_index_bytes(pass: MeshPass) -> bool {
    !matches!(pass, MeshPass::Opaque | MeshPass::Decal)
}