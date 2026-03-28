//! # Terrain Compact V2 编码器 (Terrain Compact Encoder)
//!
//! ## 职责
//! 把 mesher 的 `VertexSemantic` 压缩编码为 terrain.compact.v2 顶点布局。
//!
//! ## 输入/输出
//! - 输入：解语义后的顶点位置、法线、UV、光照、材质与附加 flag。
//! - 输出：固定 32 B stride 的交错顶点字节流，以及 32-bit quad 索引。
//!
//! ## 布局约定
//! - word0/1/2: 位置分量，带 bias 与 1/32 精度量化。
//! - word3: 法线 snorm8 打包。
//! - word4: UV 归一化到 u16。
//! - word5: 纹理层 + block/sky light。
//! - word6: RGB + alpha 常量。
//! - word7: 材质、emission 与附加 flags。

use crate::mesher::encoding::VertexEncoder;
use crate::mesher::semantic::VertexSemantic;

/// Terrain 紧凑布局编码器。
#[derive(Clone, Copy, Debug, Default)]
pub struct TerrainCompactEncoder;

impl TerrainCompactEncoder {
    // 固定 8 个 u32 word，总计 32 字节。
    pub const VERTEX_STRIDE_BYTES: usize = 32;
    pub const FLAG_WORLD_UV: u32 = 1;

    #[inline]
    /// 把一个语义顶点编码成固定 32 字节。
    pub fn encode_vertex_bytes(vertex: &VertexSemantic) -> [u8; Self::VERTEX_STRIDE_BYTES] {
        let word0 = Self::pack_position_component(vertex.position[0], 4.0, 1023.0);
        let word1 = Self::pack_position_component(vertex.position[1], 128.0, 32767.0);
        let word2 = Self::pack_position_component(vertex.position[2], 4.0, 1023.0);
        let word3 = Self::pack_normal_word(vertex);
        let word4 = Self::pack_uv_word(vertex);
        let word5 = Self::pack_texture_light_word(vertex);
        let word6 = Self::pack_color_word(vertex);
        let word7 = Self::pack_surface_word(vertex);

        let mut out = [0u8; Self::VERTEX_STRIDE_BYTES];
        out[0..4].copy_from_slice(&word0.to_le_bytes());
        out[4..8].copy_from_slice(&word1.to_le_bytes());
        out[8..12].copy_from_slice(&word2.to_le_bytes());
        out[12..16].copy_from_slice(&word3.to_le_bytes());
        out[16..20].copy_from_slice(&word4.to_le_bytes());
        out[20..24].copy_from_slice(&word5.to_le_bytes());
        out[24..28].copy_from_slice(&word6.to_le_bytes());
        out[28..32].copy_from_slice(&word7.to_le_bytes());
        out
    }

    #[inline]
    /// 以给定顶点起点写入一个 quad 的 6 个索引。
    pub fn append_indices_u32(out: &mut Vec<u32>, base_vertex: u32, order: [u32; 6]) {
        out.reserve(6);
        for index in order {
            out.push(base_vertex + index);
        }
    }

    #[inline]
    /// 量化单个位置分量。
    /// F(q)=round((value+bias)×32)，对应 1/32 方块精度。
    fn pack_position_component(value: f32, bias: f32, max_value: f32) -> u32 {
        ((value + bias) * 32.0).round().clamp(0.0, max_value) as u32
    }

    #[inline]
    /// 把法线 xyz 打包为 3 个 snorm8。
    fn pack_normal_word(vertex: &VertexSemantic) -> u32 {
        let nx = Self::pack_snorm8(vertex.normal[0]) as u32;
        let ny = Self::pack_snorm8(vertex.normal[1]) as u32;
        let nz = Self::pack_snorm8(vertex.normal[2]) as u32;
        nx | (ny << 8) | (nz << 16)
    }

    #[inline]
    /// 把 UV0 量化为两个 u16。
    fn pack_uv_word(vertex: &VertexSemantic) -> u32 {
        let u = (vertex.uv0[0] * 65535.0).round().clamp(0.0, 65535.0) as u32;
        let v = (vertex.uv0[1] * 65535.0).round().clamp(0.0, 65535.0) as u32;
        u | (v << 16)
    }

    #[inline]
    /// 打包纹理层索引与双通道光照。
    /// 低 16 bit 为 texture index，高 16 bit 分别存 block / sky light。
    fn pack_texture_light_word(vertex: &VertexSemantic) -> u32 {
        let tex = (vertex.texture_index.max(0) as u32) & 0xFFFF;
        let bl = (vertex.block_light * 255.0).round().clamp(0.0, 255.0) as u32;
        let sl = (vertex.sky_light * 255.0).round().clamp(0.0, 255.0) as u32;
        tex | (bl << 16) | (sl << 24)
    }

    #[inline]
    /// 打包 RGB 颜色并把 alpha 固定为 255。
    fn pack_color_word(vertex: &VertexSemantic) -> u32 {
        let r = (vertex.color0[0] * 255.0).round().clamp(0.0, 255.0) as u32;
        let g = (vertex.color0[1] * 255.0).round().clamp(0.0, 255.0) as u32;
        let b = (vertex.color0[2] * 255.0).round().clamp(0.0, 255.0) as u32;
        r | (g << 8) | (b << 16) | (255 << 24)
    }

    #[inline]
    /// 打包材质、发光强度与附加 surface flag。
    fn pack_surface_word(vertex: &VertexSemantic) -> u32 {
        let emission = (vertex.color0[3] * 255.0).round().clamp(0.0, 255.0) as u32;
        let material = vertex.material_id as u32;
        let flags = vertex.extra_u32 & 0xFF;
        material | (emission << 8) | (flags << 16)
    }

    #[inline]
    /// 把 [-1,1] 浮点值量化为 snorm8。
    fn pack_snorm8(value: f32) -> u8 {
        let scaled = (value.clamp(-1.0, 1.0) * 127.0).round() as i32;
        (scaled as i8) as u8
    }
}

impl VertexEncoder for TerrainCompactEncoder {
    fn layout_id(&self) -> &'static str {
        "terrain.compact.v2"
    }

    fn vertex_stride(&self) -> usize {
        Self::VERTEX_STRIDE_BYTES
    }

    fn index_stride(&self) -> usize {
        4
    }

    fn encode_vertex(&self, out: &mut Vec<u8>, vertex: &VertexSemantic) {
        out.extend_from_slice(&Self::encode_vertex_bytes(vertex));
    }

    fn encode_quad_indices(&self, out: &mut Vec<u8>, base_vertex: u32) {
        // 按统一 CCW 模式写入 6 个 u32 索引。
        for index in super::QUAD_INDICES_CCW {
            out.extend_from_slice(&(base_vertex + index).to_le_bytes());
        }
    }
}