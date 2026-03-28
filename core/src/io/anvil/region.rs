//! # Region 文件读取器 (Region Reader)
//!
//! ## 职责 (Responsibility)
//! 处理 Minecraft Region 格式 (.mca) 的低级读取，包括 Header 解析和 Chunk 数据定位。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入: `.mca` 文件的原始字节。
//! - 输出: 指定 Chunk 坐标的压缩二进制数据。
//!
//! ## MC 机制 (MC Mechanism)
//! - 4KiB Sectors: 文件按 4KiB 对齐存储。
//! - Header Table: 前 8KiB 存储位置表和时间戳表。

use byteorder::{BigEndian, ByteOrder};

/// Region 文件读取器。
/// 
/// # Note
/// Region 文件 (.mca) 存储 32x32 个 Chunk。
/// 文件头包含 1024 个位置条目，指向 Chunk 数据所在的 Sector。
pub struct Region<'a> {
    data: &'a [u8],
}

impl<'a> Region<'a> {
    /// 从原始字节数据创建 Region 读取器。
    pub fn new(data: &'a [u8]) -> Self {
        Self { data }
    }

    /// 获取指定 Chunk 坐标 (x, z) 的原始压缩数据。
    /// 
    /// # Parameters
    /// - `x`: Chunk 全局 X 坐标
    /// - `z`: Chunk 全局 Z 坐标
    /// 
    /// # Returns
    /// - `Option<(compression_type, compressed_data)>`
    ///   - `compression_type`: 1=GZip, 2=Zlib, 3=Uncompressed
    ///   - `compressed_data`: Chunk 原始压缩数据
    /// 
    /// # Implementation Details
    /// 1. 计算 Region 内相对坐标 (0-31)。
    /// 2. 查表获取 Sector 偏移和数量。
    /// 3. 读取 Chunk Header (长度 + 压缩类型)。
    pub fn get_chunk_payload(&self, x: i32, z: i32) -> Option<(u8, &'a [u8])> {
        // 转换到 Region 内相对坐标 [0, 31]
        let rx = ((x % 32) + 32) % 32;
        let rz = ((z % 32) + 32) % 32;
        
        // 计算位置表索引 (每个条目 4 字节)
        let offset_idx = 4 * (rx + rz * 32) as usize;
        if offset_idx + 4 > self.data.len() {
            return None;
        }
        
        // 读取位置数据: [offset_sectors: 3 bytes] [sector_count: 1 byte]
        let loc = BigEndian::read_u32(&self.data[offset_idx..offset_idx + 4]);
        let offset_sectors = (loc >> 8) as usize;
        let sector_count = (loc & 0xFF) as usize;

        if offset_sectors == 0 || sector_count == 0 {
            return None;
        }

        // Sector 大小固定为 4096 字节
        let sector_offset = offset_sectors * 4096;
        if sector_offset + 5 > self.data.len() {
            return None;
        }

        // 读取实际 Chunk 数据长度 (包含压缩类型字节)
        let length = BigEndian::read_u32(&self.data[sector_offset..sector_offset + 4]) as usize;
        let compression_type = self.data[sector_offset + 4];

        // 实际 Payload 大小 = 总长度 - 1 字节压缩类型
        let payload_size = length - 1;
        let payload_start = sector_offset + 5;

        if payload_start + payload_size > self.data.len() {
            return None;
        }

        Some((compression_type, &self.data[payload_start..payload_start + payload_size]))
    }
}
