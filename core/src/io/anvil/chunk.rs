//! # 区块数据结构 (Chunk Data)
//!
//! ## 职责 (Responsibility)
//! 定义 Minecraft Chunk 的内存结构，包含 Section 列表和基础元数据。
//!
//! ## 输入/输出 (Input/Output)
//! - 输入: 从 Region 文件解压的二进制流 (NBT)。
//! - 输出: 结构化的 `ChunkData` 对象。
//!
//! ## MC 机制 (MC Mechanism)
//! - Vertical Sections: 1.18+ 支持动态高度 (-64 ~ 320)。
//! - NBT Parsing: 解析 Chunk NBT 结构。

use crate::io::anvil::nbt::{parse_nbt, NbtTag};
use crate::io::anvil::section::ChunkSection;
use crate::domain::biome::BiomeId;
use crate::domain::resolve::{BiomeResolver, Resolver};
use flate2::read::{GzDecoder, ZlibDecoder};
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::Read;
#[cfg(any(debug_assertions, feature = "dev-logging"))]
use std::sync::Once;

thread_local! {
    static DECOMPRESS_BUFFER: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(1024 * 1024));
}

#[cfg(any(debug_assertions, feature = "dev-logging"))]
static LOG_CHUNK_LIGHT_ONCE: Once = Once::new();
#[cfg(any(debug_assertions, feature = "dev-logging"))]
const LOG_CHUNK_X: i32 = -16;
#[cfg(any(debug_assertions, feature = "dev-logging"))]
const LOG_CHUNK_Z: i32 = -17;

/// 表示已解析的 Chunk 数据。
/// 包含坐标、垂直 Section 集合以及高度信息。
pub struct ChunkData {
    /// Chunk 的 X 坐标
    pub x: i32,
    /// Chunk 的 Z 坐标
    pub z: i32,
    /// 垂直方向上的 Section 列表。索引 0 对应 min_y。
    /// Option::None 表示该高度的 Section 不存在（空 Section）。
    pub sections: Vec<Option<ChunkSection>>,
    /// Chunk 的最低 Y 坐标（通常为 0 或 -64，取决于版本）
    pub min_y: i8,

    /// 16x16 的 2D 生物群系 ID（用于草/树叶染色）。
    /// 索引: z * 16 + x
    pub biomes_2d: [BiomeId; 256],
    /// 默认生物群系 ID（用于越界或回退）
    pub default_biome: BiomeId,

    /// Chunk 生成状态（如 minecraft:initialize_light / minecraft:full）
    pub status: Option<String>,
}

impl ChunkData {
    /// 获取指定 Y 高度的 Section。
    /// 
    /// # 参数
    /// * `y` - Section 的 Y 索引（不是世界坐标 Y，而是 Section 索引 Y，例如 0, 1, -1 等）
    pub fn get_section(&self, y: i8) -> Option<&ChunkSection> {
        // 将有符号 Y 转换为数组索引
        let idx = (y as i32 - self.min_y as i32) as usize;
        if idx < self.sections.len() {
            self.sections[idx].as_ref()
        } else {
            None
        }
    }

    pub fn get_biome_2d(&self, x: usize, z: usize) -> BiomeId {
        if x >= 16 || z >= 16 {
            return self.default_biome;
        }
        self.biomes_2d[z * 16 + x]
    }
}

/// 解压并解析 Chunk 数据。
/// 
/// # 参数
/// * `compression` - 压缩类型 ID (1: GZip, 2: Zlib)
/// * `data` - 压缩的字节数据
/// 
/// # 支持的版本
/// * 支持旧版（包含 "Level" 标签）和新版（直接在根下）NBT 结构。
/// * 支持处理不同高度范围的 Chunk（min_y/max_y 动态检测）。
pub fn decompress_and_parse(
    compression: u8,
    data: &[u8],
    resolver: &dyn Resolver,
    biome: &dyn BiomeResolver,
) -> Result<ChunkData, String> {
    let mut buffer = Vec::new();
    // 根据压缩类型进行解压
    match compression {
        1 => {
            let mut d = GzDecoder::new(data);
            d.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        }
        2 => {
            let mut d = ZlibDecoder::new(data);
            d.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unknown compression: {}", compression)),
    }

    // 解析 NBT 结构
    let (_, root) = parse_nbt(&buffer)?;

    if let NbtTag::Compound(map) = root {
        // 兼容性处理：旧版本数据位于 "Level" 复合标签内，新版本（1.18+ 部分快照及之后）可能直接位于根节点
        let level = if let Some(NbtTag::Compound(l)) = map.get("Level") {
            l
        } else {
            &map
        };

        let x = get_int(level, "xPos").unwrap_or(0);
        let z = get_int(level, "zPos").unwrap_or(0);
        let status = get_string(level, "Status").or_else(|| get_string(level, "status"));

        let mut temp_sections = HashMap::new();
        let mut min_y = 0;
        let mut max_y = 15;

        // Default biome map: plains.
        let default_biome = biome.default_biome();
        let mut biomes_2d = [default_biome; 256];

        // Best-effort biome source: prefer section Y==0, otherwise the first section that has biomes.
        let mut biome_source: Option<(Vec<BiomeId>, Option<Vec<i64>>)> = None;
        let mut legacy_biomes: Option<Vec<i32>> = None;

        let mut parse_sections = |list: &Vec<NbtTag>| {
            for tag in list {
                if let NbtTag::Compound(s) = tag {
                    // Capture biome palette/data if present.
                    if biome_source.is_none() {
                        if let Some(parsed) = parse_section_biomes(s, biome) {
                            biome_source = Some(parsed);
                        }
                    } else {
                        // Prefer Y==0 section if available.
                        if let Some(NbtTag::Byte(yb)) = s.get("Y") {
                            if *yb == 0 {
                                if let Some(parsed) = parse_section_biomes(s, biome) {
                                    biome_source = Some(parsed);
                                }
                            }
                        }
                    }

                    if let Some(section) = ChunkSection::from_nbt(s, resolver) {
                        // 简单优化：若 Palette 为空，视为无效 Section
                        if section.palette.is_empty() {
                            continue;
                        }

                        if section.y < min_y { min_y = section.y; }
                        if section.y > max_y { max_y = section.y; }
                        temp_sections.insert(section.y, section);
                    }
                }
            }
        };

        if let Some(NbtTag::List(sec_list)) = level.get("sections") {
            parse_sections(sec_list);
        } else if let Some(NbtTag::List(sec_list)) = level.get("Sections") {
            parse_sections(sec_list);
        }

        // Capture legacy 2D/3D biomes (IntArray or ByteArray at Level root) if modern section biomes are missing
        if biome_source.is_none() {
            if let Some(NbtTag::IntArray(b)) = level.get("Biomes") {
                legacy_biomes = Some(b.clone());
            } else if let Some(NbtTag::ByteArray(b)) = level.get("Biomes") {
                // Convert Byte array (pre-1.15) to Int array for consistent handling
                legacy_biomes = Some(b.iter().map(|&x| x as i32).collect());
            }
        }

        let len = (max_y - min_y + 1) as usize;
        let mut sections = Vec::with_capacity(len);
        for i in 0..len {
            sections.push(temp_sections.remove(&(min_y + i as i8)));
        }

        // Fallback for unlit chunks: if status is initialize_light, ensure missing light arrays
        // don't black out vertex lighting in previews.
        if status.as_deref() == Some("minecraft:initialize_light") {
            for section_opt in sections.iter_mut() {
                if let Some(section) = section_opt.as_mut() {
                    if section.data.is_some() {
                        if section.block_light.is_none() {
                            section.block_light = Some(vec![0i8; 2048]);
                        }
                        // For initialize_light chunks, force sky light to fullbright.
                        // 0xFF packs two 4-bit 15s per byte.
                        section.sky_light = Some(vec![-1i8; 2048]);
                    }
                }
            }
        }

        #[cfg(any(debug_assertions, feature = "dev-logging"))]
        if x == LOG_CHUNK_X && z == LOG_CHUNK_Z {
            LOG_CHUNK_LIGHT_ONCE.call_once(|| {
                let mut total_sections = 0usize;
                let mut data_sections = 0usize;
                let mut block_light_some = 0usize;
                let mut sky_light_some = 0usize;
                let mut block_light_all_zero = 0usize;
                let mut sky_light_all_ff = 0usize;

                for section_opt in sections.iter() {
                    if let Some(section) = section_opt.as_ref() {
                        total_sections += 1;
                        if section.data.is_some() {
                            data_sections += 1;
                        }
                        if let Some(bl) = section.block_light.as_ref() {
                            block_light_some += 1;
                            if bl.iter().all(|&b| b == 0) {
                                block_light_all_zero += 1;
                            }
                        }
                        if let Some(sl) = section.sky_light.as_ref() {
                            sky_light_some += 1;
                            if sl.iter().all(|&b| b == -1) {
                                sky_light_all_ff += 1;
                            }
                        }
                    }
                }

                crate::dev_log!(
                    "[chunk light] x={} z={} status={:?} sections={} data={} block_some={} block_all_zero={} sky_some={} sky_all_ff={}",
                    x,
                    z,
                    status,
                    total_sections,
                    data_sections,
                    block_light_some,
                    block_light_all_zero,
                    sky_light_some,
                    sky_light_all_ff
                );
            });
        }

        // Expand biome paletted container (4x4x4) to 16x16 2D.
        if let Some((palette, data)) = biome_source {
            // 4x4x4 = 64 entries. We sample y_quart = 0 for 2D tinting.
            let palette_len = palette.len().max(1);
            let mut bits = ((palette_len as f64).log2().ceil() as usize).max(1);
            if bits > 32 { bits = 32; }
            let values_per_long = 64 / bits.max(1);
            let mask = if bits == 64 { u64::MAX } else { (1u64 << bits) - 1 };

            for z in 0..16 {
                for x in 0..16 {
                    let xq = x >> 2;
                    let zq = z >> 2;
                    let yq = 0usize;
                    let index = yq * 16 + zq * 4 + xq; // 0..63

                    let pal_index = if let Some(ref longs) = data {
                        if values_per_long == 0 { 0 } else {
                            let li = index / values_per_long;
                            let si = index % values_per_long;
                            if li >= longs.len() {
                                0
                            } else {
                                let v = longs[li] as u64;
                                ((v >> (si * bits)) & mask) as usize
                            }
                        }
                    } else {
                        0
                    };

                    let biome_id = palette.get(pal_index).copied().unwrap_or(default_biome);
                    biomes_2d[z * 16 + x] = biome_id;
                }
            }
        } else if let Some(biomes) = legacy_biomes {
            // Handle legacy biomes logic
            if biomes.len() == 256 {
                // 1.14 and below: 16x16 2D array
                for z in 0..16 {
                    for x in 0..16 {
                        let id = biomes[z * 16 + x] as u16;
                        match id {
                            1 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:plains"),
                            2 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:desert"),
                            3 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:mountains"),
                            4 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:forest"),
                            5 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:taiga"),
                            6 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:swamp"),
                            7 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:river"),
                            10 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:frozen_ocean"),
                            21 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:jungle"),
                            24 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:deep_ocean"),
                            _ => biomes_2d[z * 16 + x] = biome.default_biome(),
                        };
                    }
                }
            } else if biomes.len() == 1024 {
                // 1.15-1.17: 4x4x4 3D array
                for z in 0..16 {
                    for x in 0..16 {
                        let xq = x >> 2;
                        let zq = z >> 2;
                        let idx = zq * 4 + xq;
                        if idx < biomes.len() {
                            let id = biomes[idx] as u16;
                            match id {
                                1 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:plains"),
                                2 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:desert"),
                                3 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:mountains"),
                                4 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:forest"),
                                5 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:taiga"),
                                6 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:swamp"),
                                7 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:river"),
                                10 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:frozen_ocean"),
                                21 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:jungle"),
                                24 => biomes_2d[z * 16 + x] = biome.biome_id("minecraft:deep_ocean"),
                                _ => biomes_2d[z * 16 + x] = biome.default_biome(),
                            };
                        }
                    }
                }
            }
        }

        Ok(ChunkData { x, z, sections, min_y, biomes_2d, default_biome, status })
    } else {
        Err("Root not a compound".to_string())
    }
}

fn parse_section_biomes(
    map: &HashMap<String, NbtTag>,
    biome: &dyn BiomeResolver,
) -> Option<(Vec<BiomeId>, Option<Vec<i64>>)> {
    // 1.18+: section has `biomes: { palette: ["minecraft:plains", ...], data: [L; ...] }`
    let biomes_tag = map.get("biomes").or_else(|| map.get("Biomes"))?;
    let compound = match biomes_tag {
        NbtTag::Compound(c) => c,
        _ => return None,
    };

    let palette_tag = compound.get("palette")?;
    let palette_list = match palette_tag {
        NbtTag::List(list) => list,
        _ => return None,
    };

    let mut palette: Vec<BiomeId> = Vec::with_capacity(palette_list.len().max(1));
    for tag in palette_list {
        match tag {
            NbtTag::String(name) => palette.push(biome.biome_id(name)),
            NbtTag::Compound(c) => {
                if let Some(NbtTag::String(name)) = c.get("Name") {
                    palette.push(biome.biome_id(name));
                }
            }
            _ => {}
        }
    }
    if palette.is_empty() {
        palette.push(biome.default_biome());
    }

    let data = match compound.get("data") {
        Some(NbtTag::LongArray(d)) => Some(d.clone()),
        _ => None,
    };

    Some((palette, data))
}

fn get_string(map: &HashMap<String, NbtTag>, key: &str) -> Option<String> {
    match map.get(key) {
        Some(NbtTag::String(s)) => Some(s.clone()),
        _ => None,
    }
}

fn get_int(map: &HashMap<String, NbtTag>, key: &str) -> Option<i32> {
    match map.get(key) {
        Some(NbtTag::Int(i)) => Some(*i),
        _ => None,
    }
}
