//! SharedArrayBuffer 内存布局定义
//! 职责：定义 Rust 与 TypeScript 共享内存的偏移量、尺寸常量。
//! 
//! # Memory Layout
//! [Registry Area (1MB)] [Padding (64B)] [Slot 0] [Slot 1] ... [Slot N]
//! 
//! # Slot Layout
//! [Header (16B)] [Section Index (24B * 24)] [Payload (512KB)]

// 必须与 SharedMemoryManager.ts 中的常量保持精确一致！

// --- Registry Constants ---
/// 注册表条目总数
pub const REGISTRY_ENTRIES: usize = 65536;
/// 单个注册表条目字节数
pub const REGISTRY_ENTRY_BYTES: usize = 16;
/// 哈希注册表总大小 (1 MB)
pub const REGISTRY_HASH_BYTES: usize = REGISTRY_ENTRIES * REGISTRY_ENTRY_BYTES;
/// 注册表元数据区大小
pub const REGISTRY_META_BYTES: usize = 64;
/// 反向查询条目大小：[offset, len]
pub const REGISTRY_REVERSE_ENTRY_BYTES: usize = 8;
/// 反向查询总大小
pub const REGISTRY_REVERSE_BYTES: usize = REGISTRY_ENTRIES * REGISTRY_REVERSE_ENTRY_BYTES;
/// 共享字符串池大小
pub const REGISTRY_STRING_POOL_BYTES: usize = 4 * 1024 * 1024;
/// 注册表总大小
pub const REGISTRY_SIZE_BYTES: usize =
    REGISTRY_HASH_BYTES + REGISTRY_META_BYTES + REGISTRY_REVERSE_BYTES + REGISTRY_STRING_POOL_BYTES;
/// ID 计数器字节偏移
pub const REGISTRY_ID_COUNTER_OFFSET: usize = REGISTRY_HASH_BYTES;
/// 字符串池计数器字节偏移
pub const REGISTRY_STRING_COUNTER_OFFSET: usize = REGISTRY_HASH_BYTES + 4;
/// 反向查询区偏移
pub const REGISTRY_REVERSE_OFFSET: usize = REGISTRY_HASH_BYTES + REGISTRY_META_BYTES;
/// 字符串池起始偏移
pub const REGISTRY_STRING_POOL_OFFSET: usize = REGISTRY_REVERSE_OFFSET + REGISTRY_REVERSE_BYTES;
/// 头部对齐填充
pub const SAB_HEAD_PADDING: usize = 64; 
/// SAB 头部总大小 (Registry + Padding)
pub const SAB_HEAD_BYTES: usize = REGISTRY_SIZE_BYTES + SAB_HEAD_PADDING;

// --- Chunk Constants ---
/// 区块宽度 (Blocks)
pub const CHUNK_WIDTH: usize = 16;
/// 区块高度 (Blocks) (-64 to 320)
pub const CHUNK_HEIGHT: usize = 384;
/// 每个 Chunk 包含的 Section 数量
pub const SECTIONS_PER_CHUNK: usize = CHUNK_HEIGHT / 16; // 24
/// 每个 Section 的 Block 数量
pub const BLOCKS_PER_SECTION: usize = CHUNK_WIDTH * CHUNK_WIDTH * 16; // 4096
/// 每个 Section 光照数据大小 (打包的 nibble)
pub const LIGHT_BYTES_PER_SECTION: usize = BLOCKS_PER_SECTION / 2; 
/// 调色板最大条目数
pub const MAX_PALETTE_ENTRIES: usize = BLOCKS_PER_SECTION;
/// 单个调色板条目字节数 (u16 Block ID)
pub const PALETTE_ENTRY_BYTES: usize = 2; 
/// 调色板最大字节数
pub const MAX_PALETTE_BYTES: usize = MAX_PALETTE_ENTRIES * PALETTE_ENTRY_BYTES;

/// BlockStates 数据最大条目数 (Packed longs)
pub const MAX_DATA_ENTRIES: usize = (BLOCKS_PER_SECTION + 3) / 4; 
/// BlockStates 单个条目字节数 (i64)
pub const DATA_ENTRY_BYTES: usize = 8; 
/// BlockStates 最大字节数
pub const MAX_DATA_BYTES: usize = MAX_DATA_ENTRIES * DATA_ENTRY_BYTES;

/// Section 索引条目大小：palette offset/len, data offset/len, light offsets, flags
pub const SECTION_ENTRY_BYTES: usize = 24;
/// Section 索引总大小
pub const SECTION_INDEX_BYTES: usize = SECTIONS_PER_CHUNK * SECTION_ENTRY_BYTES;

/// Chunk-level 2D biome map (16x16), stored at the beginning of payload as u16 LE.
pub const BIOME_MAP_BYTES: usize = CHUNK_WIDTH * CHUNK_WIDTH * 2;
/// Chunk-level WORLD_SURFACE heightmap (16x16), stored after biome map as u16 LE.
pub const HEIGHTMAP_BYTES: usize = CHUNK_WIDTH * CHUNK_WIDTH * 2;

// --- Dynamic Memory Layout Constants ---

/// 分页块大小 (4KB)
pub const BLOCK_SIZE: usize = 4096;

// 布局计算:
// Header Area Start = Registry (1MB) + 64 Padding
pub const HEADER_AREA_START_CONST: usize = REGISTRY_SIZE_BYTES + SAB_HEAD_PADDING;

// Slot Header
pub const SLOT_HEADER_INT32S: usize = 8;
pub const SLOT_HEADER_BYTES: usize = SLOT_HEADER_INT32S * 4;

// --- Mutable Layout Config ---
static mut MAX_SLOTS: u32 = 4096; 
static mut HEADER_AREA_START: usize = HEADER_AREA_START_CONST;
static mut DATA_HEAP_START: usize = HEADER_AREA_START_CONST + (4096 * 32) + 64;

/// Configure the memory layout based on JS runtime parameters.
/// This MUST be called before any SAB operations.
pub fn configure_layout(max_slots: u32) {
    unsafe {
        MAX_SLOTS = max_slots;
        HEADER_AREA_START = REGISTRY_SIZE_BYTES + SAB_HEAD_PADDING;
        DATA_HEAP_START = HEADER_AREA_START + (max_slots as usize * SLOT_HEADER_BYTES) + 64;
    }
}

/// 获取特定 Slot Header 在 SAB 中的绝对字节偏移量
#[inline(always)]
pub fn get_slot_header_offset(slot_index: u32) -> usize {
    unsafe { HEADER_AREA_START + (slot_index as usize * SLOT_HEADER_BYTES) }
}

/// 根据 Block Index 计算数据区起始绝对偏移量
#[inline(always)]
pub fn get_data_offset(block_index: u32) -> usize {
    unsafe { DATA_HEAP_START + (block_index as usize * BLOCK_SIZE) }
}

/// 获取特定 Slot 的 Section 索引区偏移 (相对于 Data Start)
#[inline(always)]
pub fn get_section_index_offset_relative() -> usize {
    0 // Section Index 是数据区的第一部分
}


/// 获取特定 Payload 相对偏移
#[inline(always)]
pub fn get_payload_offset_relative() -> usize {
    SECTION_INDEX_BYTES
}

// --- Absolute Offset Helpers (Requires resolved data_base) ---

/// 计算特定 Section 的索引条目绝对偏移量
#[inline(always)]
pub fn get_section_entry_offset_absolute(data_base: usize, section_index: usize) -> usize {
    data_base + section_index * SECTION_ENTRY_BYTES
}

/// 获取 Payload 起始绝对偏移量
#[inline(always)]
pub fn get_payload_base_absolute(data_base: usize) -> usize {
    data_base + SECTION_INDEX_BYTES
}

