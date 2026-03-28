//! SAB 数据编解码器
//! 职责：处理 Chunk 数据在 SAB Payload 区域的具体二进制格式。
//! 只关注"如何把 ChunkData 变成字节"以及"如何把字节变回 ChunkData"，
//! 不关心 SAB 的 Slot 管理或内存分配。

use crate::io::anvil::chunk::ChunkData;
use crate::io::anvil::section::ChunkSection;
use crate::runtime::sab::layout::*;
use crate::runtime::sab::client::{write_bytes, read_bytes};
use std::convert::TryInto;
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

// ============================================================================
// Scratch Buffers：线程局部缓存
// ============================================================================
thread_local! {
    pub static PALETTE_SCRATCH: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(8192));
    pub static DATA_SCRATCH: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(16384));
    pub static LIGHT_SCRATCH: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(2048));
}

/// Block Light 存在标志位 (Bit 0)
pub const FLAG_BLOCK_LIGHT: u8 = 0b01;
/// Sky Light 存在标志位 (Bit 1)
pub const FLAG_SKY_LIGHT: u8 = 0b10;
pub const AIR_BLOCK_ID: u16 = 0;

#[inline]
fn encode_palette_block_id(block_id: u32) -> u16 {
    block_id as u16
}

#[inline]
fn decode_palette_block_id(block_id: u16) -> u32 {
    block_id as u32
}

/// 计算存储此 ChunkData 所需的 Payload 字节大小
/// 包括 Biome Map, Palette, Block Data, Light Data
pub fn calculate_payload_size(chunk_data: &ChunkData) -> usize {
    let mut needed = BIOME_MAP_BYTES;
    let sab_start_y = -4; 
    
    for section_idx in 0..SECTIONS_PER_CHUNK {
        // SAB 总是从 Y=-64 开始
        if let Some(section) = chunk_data.get_section(sab_start_y + section_idx as i8) {
             // 预估: 这里的计算逻辑必须与 encode_chunk 保持严格一致
            needed += section.palette.len() * 2;
            if let Some(d) = &section.data { needed += d.len() * 8; }
            if section.block_light.is_some() { needed += LIGHT_BYTES_PER_SECTION; }
            if section.sky_light.is_some() { needed += LIGHT_BYTES_PER_SECTION; }
        }
    }
    needed
}

/// 将数据段写入 Payload (辅助函数)
fn write_payload_segment(
    cursor: &mut usize,
    payload_base: usize,
    payload_limit: usize,
    bytes: &[u8],
) -> Result<Option<u32>, JsValue> {
    if bytes.is_empty() {
        return Ok(None);
    }
    let start = payload_base + *cursor;
    let end = start + bytes.len();
    if end > payload_limit {
        return Err(JsValue::from_str("SAB chunk payload overflow"));
    }
    write_bytes(start as u32, bytes);
    let relative = *cursor as u32;
    *cursor += bytes.len();
    Ok(Some(relative))
}

/// 将 ChunkData 编码并写入 SAB 指定位置
pub fn encode_chunk(
    chunk_data: &ChunkData,
    data_base: usize,
    payload_limit: usize,
) -> Result<(), JsValue> {
    let payload_base = get_payload_base_absolute(data_base);
    let mut cursor = BIOME_MAP_BYTES;

    // 1. Write Biome Map (16x16 u16)
    {
        let mut biome_bytes = [0u8; BIOME_MAP_BYTES];
        for (i, &bid) in chunk_data.biomes_2d.iter().enumerate() {
            let o = i * 2;
            biome_bytes[o..o + 2].copy_from_slice(&(bid as u16).to_le_bytes());
        }
        write_bytes(payload_base as u32, &biome_bytes);
    }

    let sab_start_section_y = -4; 

    // 2. Iterate Sections
    for section_idx in 0..SECTIONS_PER_CHUNK {
        let entry_offset = get_section_entry_offset_absolute(data_base, section_idx);
        let target_y = sab_start_section_y + (section_idx as i8);
        
        // 获取 section 数据 (处理 flat_data 转换)
        let section_slot = chunk_data.get_section(target_y);
        
        if let Some(section) = section_slot {
            let mut rebuilt_holder = None;
            // 如果只有 flat_data (旧格式/导入数据)，需要转换
            if let Some(flat) = &section.flat_data {
                let flat_u16: Vec<u16> = flat.iter().map(|&bid| bid as u16).collect();
                rebuilt_holder = Some(ChunkSection::from_block_ids(
                    section.y,
                    &flat_u16,
                    section.block_light.clone(),
                    section.sky_light.clone(),
                ));
            }
            let source = rebuilt_holder.as_ref().unwrap_or(section);

            // 校验容量
            if source.palette.len() > MAX_PALETTE_ENTRIES {
                 // 简单的 panic/error 可能会导致 WASM 如果没有 catch 就挂掉，这里返回 Result
                 return Err(JsValue::from_str("palette overflow"));
            }

            let palette_len = source.palette.len();
            let data_len = source.data.as_ref().map(|v| v.len()).unwrap_or(0);

            // 准备 Section Entry Header
            let mut entry = [0u8; SECTION_ENTRY_BYTES];
            entry[4..6].copy_from_slice(&(palette_len as u16).to_le_bytes());
            entry[10..12].copy_from_slice(&(data_len as u16).to_le_bytes());

            // 2.1 Write Palette
            {
                let byte_len = palette_len * 2;
                PALETTE_SCRATCH.with(|scratch| {
                    let mut buf = scratch.borrow_mut();
                    if buf.len() < byte_len { buf.resize(byte_len, 0); }
                    
                    for (i, &pid) in source.palette.iter().enumerate() {
                        let o = i * 2;
                        buf[o..o+2].copy_from_slice(&encode_palette_block_id(pid).to_le_bytes());
                    }
                    if let Some(rel) = write_payload_segment(&mut cursor, payload_base, payload_limit, &buf[..byte_len])? {
                        entry[0..4].copy_from_slice(&rel.to_le_bytes());
                    }
                    Ok::<(), JsValue>(())
                })?;
            }

            // 2.2 Write Block Data
            if let Some(data) = &source.data {
                let byte_len = data.len() * 8;
                DATA_SCRATCH.with(|scratch| {
                    let mut buf = scratch.borrow_mut();
                    if buf.len() < byte_len { buf.resize(byte_len, 0); }
                    
                    for (i, &val) in data.iter().enumerate() {
                        let o = i * 8;
                        buf[o..o+8].copy_from_slice(&val.to_le_bytes());
                    }
                     if let Some(rel) = write_payload_segment(&mut cursor, payload_base, payload_limit, &buf[..byte_len])? {
                        entry[6..10].copy_from_slice(&rel.to_le_bytes());
                    }
                    Ok::<(), JsValue>(())
                })?;
            }

            // 2.3 Write Light
            let mut flags = 0u8;
            if let Some(light) = &source.block_light {
                LIGHT_SCRATCH.with(|scratch| {
                    let mut buf = scratch.borrow_mut();
                    if buf.len() < LIGHT_BYTES_PER_SECTION { buf.resize(LIGHT_BYTES_PER_SECTION, 0); }
                    
                    // i8 -> u8 cast
                    for (i, &val) in light.iter().enumerate() {
                        buf[i] = val as u8;
                    }
                    if let Some(rel) = write_payload_segment(&mut cursor, payload_base, payload_limit, &buf[..LIGHT_BYTES_PER_SECTION])? {
                        entry[12..16].copy_from_slice(&rel.to_le_bytes());
                        flags |= FLAG_BLOCK_LIGHT;
                    }
                    Ok::<(), JsValue>(())
                })?;
            }
            if let Some(light) = &source.sky_light {
                LIGHT_SCRATCH.with(|scratch| {
                    let mut buf = scratch.borrow_mut();
                    if buf.len() < LIGHT_BYTES_PER_SECTION { buf.resize(LIGHT_BYTES_PER_SECTION, 0); }
                    
                    // i8 -> u8 cast
                    for (i, &val) in light.iter().enumerate() {
                        buf[i] = val as u8;
                    }
                    if let Some(rel) = write_payload_segment(&mut cursor, payload_base, payload_limit, &buf[..LIGHT_BYTES_PER_SECTION])? {
                        entry[16..20].copy_from_slice(&rel.to_le_bytes());
                        flags |= FLAG_SKY_LIGHT;
                    }
                    Ok::<(), JsValue>(())
                })?;
            }

            entry[20] = flags;
            write_bytes(entry_offset as u32, &entry);
        } else {
             // 如果 section 不存在，清空 entry (特别是长度字段)
             // 实际上 entry_offset 可能有旧数据，所以最好清零
             let empty_entry = [0u8; SECTION_ENTRY_BYTES];
             write_bytes(entry_offset as u32, &empty_entry);
        }
    }

    Ok(())
}

/// 从 SAB 解码 ChunkData
pub fn decode_chunk(
    x: i32,
    z: i32,
    data_base: usize,
    default_biome: u16,
) -> ChunkData {
    let payload_base = get_payload_base_absolute(data_base);
    let mut sections = Vec::with_capacity(SECTIONS_PER_CHUNK);

    // 1. Read Biomes
    let mut biomes_2d = [default_biome; 256];
    {
        let mut bytes = [0u8; BIOME_MAP_BYTES];
        read_bytes(payload_base as u32, &mut bytes);
        for i in 0..256 {
            let o = i * 2;
            biomes_2d[i] = u16::from_le_bytes([bytes[o], bytes[o + 1]]);
        }
    }
    
    // 2. Read Sections
    for section_idx in 0..SECTIONS_PER_CHUNK {
        let entry_offset = get_section_entry_offset_absolute(data_base, section_idx);
        let mut entry = [0u8; SECTION_ENTRY_BYTES];
        read_bytes(entry_offset as u32, &mut entry);
        
        let palette_len = u16::from_le_bytes([entry[4], entry[5]]) as usize;
        if palette_len == 0 {
            sections.push(None);
            continue;
        }

        let data_len = u16::from_le_bytes([entry[10], entry[11]]) as usize;
        let palette_rel = u32::from_le_bytes(entry[0..4].try_into().unwrap()) as usize;
        let data_rel = u32::from_le_bytes(entry[6..10].try_into().unwrap()) as usize;
        let block_light_rel = u32::from_le_bytes(entry[12..16].try_into().unwrap()) as usize;
        let sky_light_rel = u32::from_le_bytes(entry[16..20].try_into().unwrap()) as usize;
        let light_flags = entry[20];

        // Read Palette
        let palette = PALETTE_SCRATCH.with(|scratch| {
            let mut buf = scratch.borrow_mut();
            let byte_len = palette_len * PALETTE_ENTRY_BYTES;
            buf.resize(byte_len, 0);
            read_bytes((payload_base + palette_rel) as u32, &mut buf[..byte_len]);
            
            let mut palette = Vec::with_capacity(palette_len);
            for chunk in buf[..byte_len].chunks_exact(2) {
                palette.push(decode_palette_block_id(u16::from_le_bytes([chunk[0], chunk[1]])));
            }
            palette
        });

        // Read Data
        let data_vec = if data_len > 0 {
            DATA_SCRATCH.with(|scratch| {
                let mut buf = scratch.borrow_mut();
                let byte_len = data_len * DATA_ENTRY_BYTES;
                buf.resize(byte_len, 0);
                read_bytes((payload_base + data_rel) as u32, &mut buf[..byte_len]);
                
                let mut packed = Vec::with_capacity(data_len);
                for chunk in buf[..byte_len].chunks_exact(8) {
                    packed.push(i64::from_le_bytes(chunk.try_into().unwrap()));
                }
                Some(packed)
            })
        } else {
            None
        };

        // Read Light
        let block_light = if (light_flags & FLAG_BLOCK_LIGHT) != 0 {
            LIGHT_SCRATCH.with(|scratch| {
                let mut buf = scratch.borrow_mut();
                buf.resize(LIGHT_BYTES_PER_SECTION, 0);
                read_bytes((payload_base + block_light_rel) as u32, &mut buf[..LIGHT_BYTES_PER_SECTION]);
                Some(buf[..LIGHT_BYTES_PER_SECTION].iter().map(|&b| b as i8).collect())
            })
        } else {
            None
        };

        let sky_light = if (light_flags & FLAG_SKY_LIGHT) != 0 {
            LIGHT_SCRATCH.with(|scratch| {
                let mut buf = scratch.borrow_mut();
                buf.resize(LIGHT_BYTES_PER_SECTION, 0);
                read_bytes((payload_base + sky_light_rel) as u32, &mut buf[..LIGHT_BYTES_PER_SECTION]);
                Some(buf[..LIGHT_BYTES_PER_SECTION].iter().map(|&b| b as i8).collect())
            })
        } else {
            None
        };

        // Section Y = section_idx - 4
        let y = (section_idx as i8) - 4;

        sections.push(Some(ChunkSection::from_palette_and_data(
            y,
            palette,
            data_vec,
            block_light,
            sky_light,
        )));
    }

    ChunkData {
        x,
        z,
        sections,
        biomes_2d,
        min_y: -4,
        default_biome,
        status: None,
    }
}
