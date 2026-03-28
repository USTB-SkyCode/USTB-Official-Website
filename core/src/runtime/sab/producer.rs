//! SAB 生产者模块
//! 职责：负责解析来自 Anvil 格式的区块数据，并将其序列化写入 SharedArrayBuffer (SAB)。
//! 
//! # Workflow
//! 1. 接收压缩/未压缩的二进制 Chunk 数据。
//! 2. `decompress_and_parse`: 解析为 `ChunkData` 结构。
//! 3. `parse_and_store_chunk`: 
//!    - 检查 SAB 容量
//!    - 更新 Header (Block Count 等)
//!    - 调用 codec 写入 Payload
//!
//! # 优化
//! 具体的序列化逻辑已提取到 `sab::codec` 模块。

use wasm_bindgen::prelude::*;
use crate::io::anvil::chunk::decompress_and_parse;
use crate::io::anvil::chunk::ChunkData;
use crate::domain::resolve::{BiomeGlobal, ResolveMap};
use crate::runtime::sab::client::{write_bytes, get_sab_view_i32};
use crate::runtime::sab::layout::*;
use crate::runtime::sab::codec::{encode_chunk, calculate_payload_size};
use crate::runtime::state::MANAGER;

use std::collections::HashMap;
use std::sync::Mutex;
use lazy_static::lazy_static;

// --- Global Buffer for Two-Phase Commits ---
lazy_static! {
    static ref CHUNK_BUFFER: Mutex<HashMap<u32, ChunkData>> = Mutex::new(HashMap::new());
}

/// 第一阶段：解析区块并缓冲数据
///
/// 返回值：
/// - `buffer_id`: 缓冲句柄 (实际上是 chunk key hash)
/// - `needed_bytes`: 所需 SAB 内存大小
#[wasm_bindgen]
pub fn buffer_chunk_data(chunk_x: i32, chunk_z: i32, compression: u8, data: &[u8]) -> Result<Vec<u32>, JsValue> {
     // 安全检查：确保 BlockModelManager 已初始化
     let manager_initialized = MANAGER.with(|m| m.borrow().is_some());
     if !manager_initialized {
         return Err(JsValue::from_str("BlockModelManager not initialized - cannot parse chunk"));
     }

     let chunk_data = MANAGER.with(|mgr| {
        let mgr_ref = mgr.borrow();
        let resolver = match &*mgr_ref {
            Some(m) => m,
            None => return Err(JsValue::from_str("BlockModelManager not initialized - cannot parse chunk")),
        };

        let cache = ResolveMap::new(resolver);
        let biome = BiomeGlobal;
        decompress_and_parse(compression, data, &cache, &biome)
            .map_err(|e| JsValue::from_str(&format!("Anvil Parse Error: {}", e)))
    })?;

    // --- Capacity Check ---
    let needed_payload = calculate_payload_size(&chunk_data);
    let total_needed = SECTION_INDEX_BYTES + needed_payload;

    let buffer_id = ((chunk_x as u32) & 0xFFFF) | (((chunk_z as u32) & 0xFFFF) << 16);
    
    // Store in Buffer
    if let Ok(mut map) = CHUNK_BUFFER.lock() {
        map.insert(buffer_id, chunk_data);
    } else {
         return Err(JsValue::from_str("Failed to acquire lock on CHUNK_BUFFER"));
    }

    Ok(vec![buffer_id, total_needed as u32])
}

/// 第二阶段：将缓冲的数据写入分配好的 SAB Slot
/// 
/// 写入完成后自动清除缓冲。
#[wasm_bindgen]
pub fn flush_chunk_data(buffer_id: u32, slot_index: u32) -> Result<(), JsValue> {
    let chunk_data_opt = if let Ok(mut map) = CHUNK_BUFFER.lock() {
        map.remove(&buffer_id)
    } else {
        return Err(JsValue::from_str("Failed to acquire lock on CHUNK_BUFFER"));
    };

    let chunk_data = match chunk_data_opt {
        Some(d) => d,
        None => return Err(JsValue::from_str(&format!("Chunk Buffer Not Found: {}", buffer_id))),
    };

    // --- Standard Write Logic ---
    let header_offset = get_slot_header_offset(slot_index);
    let (block_index, block_count) = get_sab_view_i32(|view| {
        let idx = (header_offset / 4) as u32;
        let b_idx = view.get_index(idx + 4) as u32;
        let b_cnt = view.get_index(idx + 5) as u32;
        (b_idx, b_cnt)
    });

    if block_count == 0 {
        return Err(JsValue::from_str(&format!("Slot {} has 0 blocks allocated", slot_index)));
    }
    
    // Check Payload vs Alloc
    let data_base = get_data_offset(block_index);
    let total_bytes = (block_count as usize) * BLOCK_SIZE;
    let payload_limit = data_base + total_bytes; 
    let needed_payload = calculate_payload_size(&chunk_data);
    
    let total_used = SECTION_INDEX_BYTES + needed_payload;
    if total_used > total_bytes {
          return Err(JsValue::from_str(&format!("Allocated slot too small. Needed {}, Got {}", total_used, total_bytes)));
    }

    // Encode
    encode_chunk(&chunk_data, data_base, payload_limit)?;

    // Update Header
    let init_flag = if chunk_data.status.as_deref() == Some("minecraft:initialize_light") { 1 } else { 0 };
    get_sab_view_i32(|view| {
        let idx = (header_offset / 4) as u32;
        // Header Layout: [0]X [1]Z [2]Ver [3]Ready [4]BlkIdx [5]BlkCnt [6]PayloadLen
        view.set_index(idx + 6, total_used as i32);
        view.set_index(idx + 7, init_flag);
    });

    Ok(())
}

/// 解析并存储区块数据到指定 Slot (Legacy Single-Pass Mode)。
/// 
/// # Parameters
/// - `slot_index`: 目标 Slot索引。
/// - `compression`: 压缩类型 (1=GZip, 2=Zlib, 3=None)。
/// - `data`: 二进制 Chunk 数据。
///
/// # Errors
/// - 如果 `DataManager` 未初始化或解析失败，抛出 JS 异常。
#[wasm_bindgen]
pub fn parse_and_store_chunk(slot_index: u32, compression: u8, data: &[u8]) -> Result<(), JsValue> {
    // 安全检查：确保 BlockModelManager 已初始化
    let manager_initialized = MANAGER.with(|m| m.borrow().is_some());
    if !manager_initialized {
        return Err(JsValue::from_str("BlockModelManager not initialized - cannot parse chunk"));
    }

    // 1. 获取动态分配信息
    let header_offset = get_slot_header_offset(slot_index);
    let (block_index, block_count) = get_sab_view_i32(|view| {
        let idx = (header_offset / 4) as u32;
        let b_idx = view.get_index(idx + 4) as u32;
        let b_cnt = view.get_index(idx + 5) as u32;
        (b_idx, b_cnt)
    });
    
    if block_count == 0 {
        return Err(JsValue::from_str(&format!("Slot {} has 0 blocks allocated", slot_index)));
    }

    let chunk_data = MANAGER.with(|mgr| {
        let mgr_ref = mgr.borrow();
        let resolver = match &*mgr_ref {
            Some(m) => m,
            None => return Err(JsValue::from_str("BlockModelManager not initialized - cannot parse chunk")),
        };

        let cache = ResolveMap::new(resolver);
        let biome = BiomeGlobal;
        decompress_and_parse(compression, data, &cache, &biome)
            .map_err(|e| JsValue::from_str(&format!("Anvil Parse Error: {}", e)))
    })?;

    // --- Capacity Check ---
    let needed_payload = calculate_payload_size(&chunk_data);
    let total_needed = SECTION_INDEX_BYTES + needed_payload;
    let allocated_bytes = (block_count as usize) * BLOCK_SIZE;
    
    if total_needed > allocated_bytes {
        let needed_blocks = (total_needed + BLOCK_SIZE - 1) / BLOCK_SIZE;
        return Err(JsValue::from_str(&format!("OOM:Needed:{}", needed_blocks))); 
    }

    // 2. 计算内存边界
    let data_base = get_data_offset(block_index);
    let total_bytes = (block_count as usize) * BLOCK_SIZE;
    let payload_limit = data_base + total_bytes; 

    // 3. 编码并写入
    encode_chunk(&chunk_data, data_base, payload_limit)?;

    // 4. Update Header[6] PayloadLen for statistics
    // 重新计算实际使用的 Payload 大小（应该等于 calculate_payload_size 的结果，为了保险这里重算或复用）
    let total_used = SECTION_INDEX_BYTES + calculate_payload_size(&chunk_data);
    
    let init_flag = if chunk_data.status.as_deref() == Some("minecraft:initialize_light") { 1 } else { 0 };
    get_sab_view_i32(|view| {
        let idx = (header_offset / 4) as u32;
        // Header Layout: [0]X [1]Z [2]Ver [3]Ready [4]BlkIdx [5]BlkCnt [6]PayloadLen
        view.set_index(idx + 6, total_used as i32);
        view.set_index(idx + 7, init_flag);
    });

    Ok(())
}

/// 用"空气"填充指定 Slot。
/// 
/// 实际上是清空 Section 索引区域。
/// 每个 Section 条目 24 字节，24 个 Section 共 576 字节。
/// 全 0 意味着没有 Palette、没有 Data、没有 Light，即完全空置。
#[wasm_bindgen]
pub fn fill_slot_with_air(slot_index: u32) {
    let header_off = get_slot_header_offset(slot_index);
    let (block_index, block_count) = get_sab_view_i32(|view| {
        let idx = (header_off / 4) as u32;
         // View index 4 is blockIndex
         let b_idx = view.get_index(idx + 4) as u32;
         let b_cnt = view.get_index(idx + 5) as u32;
         (b_idx, b_cnt)
    });
    
    // 如果没有 blockIndex 或 blockCount 为 0，说明内存未分配，不需要 clear
    if block_index == 0 || block_count == 0 {
        return;
    }

    // Clear biome map + heightmap region (payload start) to default 0.
    let data_base = get_data_offset(block_index);
    let payload_base = get_payload_base_absolute(data_base);
    write_bytes(payload_base as u32, &[0u8; BIOME_MAP_BYTES + HEIGHTMAP_BYTES]);

    write_bytes(data_base as u32, &vec![0u8; SECTION_INDEX_BYTES]);
}
