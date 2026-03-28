//! # 子区块数据结构 (Chunk Section)
//!
//! ## 职责 (Responsibility)
//! 定义 16x16x16 的子区块数据。处理 Paletted Container 的存储和解析。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入: Section NBT 数据。
//! - 输出: 可查询 BlockId 的容器。
//!
//! ## MC 机制 (MC Mechanism)
//! - Paletted Storage: 使用 Palette + 压缩索引数组存储方块，节省内存。
//! - Flexible Bit Width: 根据 Palette 大小动态调整每个 Block 的存储位宽 (4 bits, 5 bits, ..., global)。

use crate::io::anvil::nbt::NbtTag;
use crate::domain::block::BlockId;
use crate::domain::resolve::Resolver;
use std::collections::HashMap;

/// 16x16x16 Chunk Section 数据结构。
/// 
/// # Note
/// 包含方块数据（Palette + 索引数组）及光照数据。
pub struct ChunkSection {
    /// 该 Section 的 Y 索引（-4 到 19 等）
    pub y: i8,
    /// 方块状态 Palette。
    /// 索引数组中的每个值都指向此 Palette 中的一个条目。
    pub palette: Vec<BlockId>,
    /// 压缩的方块状态索引数组。
    /// 使用灵活位宽存储，每个 long (64位) 包含多个索引。
    /// 如果为 None，则整个 Section 由 Palette 中的第一个方块（通常是空气）填充。
    pub data: Option<Vec<i64>>,
    /// Block Light 数据（0-15），每半字节 (Nibble) 一个值。
    pub block_light: Option<Vec<i8>>,
    /// Sky Light 数据（0-15），每半字节 (Nibble) 一个值。
    pub sky_light: Option<Vec<i8>>,
    /// 预计算：每个索引的位宽。
    bits_per_index: u8,
    /// 预计算：单个 long 能容纳的索引个数。
    blocks_per_long: u8,
    /// 预计算：提取索引的掩码。
    mask: u64,
    /// 优化：直接存储的 Flat ID 数组 (用于 SAB/Runtime 模式)
    /// 如果存在，忽略 palette 和 data。
    pub flat_data: Option<Vec<BlockId>>,
}

impl ChunkSection {
    /// Create an empty section with flat data support
    pub fn new_flat(y: i8, flat: Vec<BlockId>) -> Self {
        Self {
            y,
            palette: Vec::new(),
            data: None,
            block_light: None,
            sky_light: None,
            bits_per_index: 0,
            blocks_per_long: 0,
            mask: 0,
            flat_data: Some(flat),
        }
    }

    /// 从 NBT 数据解析 ChunkSection。
    /// 
    /// # Parameters
    /// - `map`: NBT Compound 数据
    /// 
    /// # Returns
    /// - `Option<Self>`: 解析成功返回 Section，否则 None
    /// 
    /// # Compatibility
    /// - 1.16+: `block_states` { palette, data }
    /// - Pre-1.16: `Palette` + `BlockStates` at root
    pub fn from_nbt(map: &HashMap<String, NbtTag>, resolver: &dyn Resolver) -> Option<Self> {
        let y = match map.get("Y") {
            Some(NbtTag::Byte(b)) => *b,
            _ => return None,
        };

        // Modern format (1.16+): block_states { palette, data }
        let mut palette: Vec<BlockId> = Vec::new();
        let mut data: Option<Vec<i64>> = None;

        if let Some(NbtTag::Compound(bs)) = map.get("block_states").or_else(|| map.get("BlockStates")) {
            if let Some(NbtTag::List(p)) = bs.get("palette") {
                palette = p
                    .iter()
                    .filter_map(|tag| {
                        if let NbtTag::Compound(c) = tag {
                            let name = match c.get("Name") {
                                Some(NbtTag::String(s)) => s,
                                _ => return None,
                            };
                        let mut properties = if let Some(NbtTag::Compound(props)) = c.get("Properties") {
                            props.iter().filter_map(|(k, v)| {
                                if let NbtTag::String(s) = v {
                                    Some((k.clone(), s.clone()))
                                } else {
                                    None
                                }
                            }).collect::<Vec<_>>()
                        } else {
                            Vec::new()
                        };
                        properties.sort_unstable_by(|a, b| a.0.cmp(&b.0));
                        
                        let id = resolver.block_id(name, properties);
                        Some(id)
                    } else {
                        None
                    }
                })
                .collect();
            }

            data = match bs.get("data") {
                Some(NbtTag::LongArray(d)) => Some(d.clone()),
                _ => None,
            };
        }

        // Old flattened format (pre-1.16): Palette + BlockStates at section root
        if palette.is_empty() {
            if let Some(NbtTag::List(p)) = map.get("Palette") {
                palette = p
                    .iter()
                    .filter_map(|tag| {
                        if let NbtTag::Compound(c) = tag {
                            let name = match c.get("Name") {
                                Some(NbtTag::String(s)) => s,
                                _ => return None,
                            };
                            let mut properties = if let Some(NbtTag::Compound(props)) = c.get("Properties") {
                                props.iter().filter_map(|(k, v)| {
                                    if let NbtTag::String(s) = v {
                                        Some((k.clone(), s.clone()))
                                    } else {
                                        None
                                    }
                                }).collect::<Vec<_>>()
                            } else {
                                Vec::new()
                            };
                            properties.sort_unstable_by(|a, b| a.0.cmp(&b.0));
                            
                            let id = resolver.block_id(name, properties);
                            Some(id)
                        } else {
                            None
                        }
                    })
                    .collect();
            }
        }

        if data.is_none() {
            if let Some(NbtTag::LongArray(d)) = map.get("BlockStates") {
                data = Some(d.clone());
            }
        }

        if palette.is_empty() {
            if map.contains_key("Blocks") {
                crate::dev_warn!("Section Y={} has 'Blocks' but no palette (legacy IDs)", y);
            }
        }

        let block_light = match map.get("BlockLight") {
            Some(NbtTag::ByteArray(b)) => Some(b.clone()),
            _ => None,
        };

        let sky_light = match map.get("SkyLight") {
            Some(NbtTag::ByteArray(b)) => Some(b.clone()),
            _ => None,
        };

        let (bits_per_index, blocks_per_long, mask) = if palette.is_empty() || data.is_none() {
            (0, 0, 0)
        } else {
            let bits = ((palette.len() as f64).log2().ceil() as usize).max(4);
            let bpl = (64 / bits) as u8;
            (bits as u8, bpl, (1u64 << bits) - 1)
        };

        Some(Self {
            y,
            palette,
            data,
            block_light,
            sky_light,
            bits_per_index,
            blocks_per_long,
            mask,
            flat_data: None,
        })
    }

    /// 获取指定相对坐标 (x, y, z) 处的方块状态。
    /// 
    /// # 参数
    /// * `x`, `y`, `z` - Section 内的相对坐标 (0-15)。
    /// # 实现细节
    /// 1. 计算每个索引所需的位数 (`bits`)：`ceil(log2(palette_len))`，最小为 4。
    /// 2. 计算每个 64 位整数包含的索引数：`64 / bits`。
    /// 3. 定位包含目标索引的 long 值及其内部偏移。
    /// 4. 提取位并掩码，得到 Palette 索引。
    pub fn get_block_state(&self, x: usize, y: usize, z: usize) -> Option<BlockId> {
        // 计算线性索引：Y * 256 + Z * 16 + X
        let index = y * 256 + z * 16 + x;

        // Fast Path: Flat Data (SAB)
        if let Some(flat) = &self.flat_data {
            if index < flat.len() {
                return Some(flat[index]);
            }
            return None;
        }

        if self.palette.is_empty() {
            return None;
        }
        
        // 如果没有数据数组，说明整个 Section 都是单一类型的 Block
        if self.data.is_none() {
            return self.palette.get(0).copied();
        }

        let data = self.data.as_ref().unwrap();

        let bits = self.bits_per_index as usize;
        let blocks_per_long = self.blocks_per_long as usize;
        if bits == 0 || blocks_per_long == 0 {
            return self.palette.get(0).copied();
        }

        let long_index = index / blocks_per_long;
        let sub_index = index % blocks_per_long;
        
        if long_index >= data.len() {
            return self.palette.get(0).copied();
        }

        // 提取 Palette 索引
        let long = data[long_index] as u64;
        let palette_index = (long >> (sub_index * bits)) & self.mask;
        
        self.palette.get(palette_index as usize).copied()
    }

    pub fn get_block_palette_index(&self, x: usize, y: usize, z: usize) -> usize {
        if self.palette.is_empty() {
            return 0;
        }
        if self.data.is_none() {
            return 0;
        }

        let data = self.data.as_ref().unwrap();
        let index = y * 256 + z * 16 + x;
        
        let bits = self.bits_per_index as usize;
        let blocks_per_long = self.blocks_per_long as usize;
        if bits == 0 || blocks_per_long == 0 {
            return 0;
        }

        let long_index = index / blocks_per_long;
        let sub_index = index % blocks_per_long;
        
        if long_index >= data.len() {
            return 0;
        }

        let long = data[long_index] as u64;
        let palette_index = (long >> (sub_index * bits)) & self.mask;
        
        palette_index as usize
    }

    pub fn from_palette_and_data(
        y: i8,
        palette: Vec<BlockId>,
        data: Option<Vec<i64>>,
        block_light: Option<Vec<i8>>,
        sky_light: Option<Vec<i8>>,
    ) -> Self {
        let bits_per_index_usize = (palette.len() as f64).log2().ceil() as usize;
        let bits_per_index_usize = bits_per_index_usize.max(4);
        let blocks_per_long_usize = 64 / bits_per_index_usize;
        let mask = (1u64 << bits_per_index_usize) - 1;

        ChunkSection {
            y,
            palette,
            data,
            block_light,
            sky_light,
            bits_per_index: bits_per_index_usize as u8,
            blocks_per_long: blocks_per_long_usize as u8,
            mask,
            flat_data: None,
        }
    }

    pub fn from_block_ids(
        y: i8,
        ids_u16: &[u16],
        block_light: Option<Vec<i8>>,
        sky_light: Option<Vec<i8>>,
    ) -> Self {
        use std::collections::HashMap;

        // Palette[0] is air.
        let mut palette: Vec<BlockId> = vec![0];
        let mut index_of: HashMap<BlockId, u32> = HashMap::new();
        index_of.insert(0, 0);

        for &id in ids_u16 {
            let bid = id as BlockId;
            if !index_of.contains_key(&bid) {
                let idx = palette.len() as u32;
                palette.push(bid);
                index_of.insert(bid, idx);
            }
        }

        let bits_per_index_usize = (palette.len() as f64).log2().ceil() as usize;
        let bits_per_index_usize = bits_per_index_usize.max(4);
        let blocks_per_long_usize = 64 / bits_per_index_usize;
        let mask = (1u64 << bits_per_index_usize) - 1;

        let mut data = vec![0i64; (4096 + blocks_per_long_usize - 1) / blocks_per_long_usize];

        for (i, &id) in ids_u16.iter().enumerate() {
            let pal_idx = *index_of.get(&(id as BlockId)).unwrap_or(&0) as u64;
            let long_index = i / blocks_per_long_usize;
            let sub_index = i % blocks_per_long_usize;
            let shift = sub_index * bits_per_index_usize;
            let cur = data[long_index] as u64;
            let cleared = cur & !(mask << shift);
            let next = cleared | ((pal_idx & mask) << shift);
            data[long_index] = next as i64;
        }

        ChunkSection {
            y,
            palette,
            data: Some(data),
            block_light,
            sky_light,
            bits_per_index: bits_per_index_usize as u8,
            blocks_per_long: blocks_per_long_usize as u8,
            mask,
            flat_data: None,
        }
    }
}
