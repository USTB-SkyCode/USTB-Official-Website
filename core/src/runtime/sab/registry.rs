//! Global ID Registry
//!
//! 基于 SharedArrayBuffer 的无锁哈希表，用于维护全局唯一的字符串ID映射。
//! 解决了多线程环境下 ID 分配冲突的问题。

use js_sys::{Atomics};
use crate::domain::block::ids::IdSource;
use crate::runtime::sab::client::{get_sab_view_i32, read_bytes, write_bytes};
use crate::runtime::sab::layout::{
    REGISTRY_ENTRIES,
    REGISTRY_ENTRY_BYTES,
    REGISTRY_ID_COUNTER_OFFSET,
    REGISTRY_REVERSE_OFFSET,
    REGISTRY_STRING_COUNTER_OFFSET,
    REGISTRY_STRING_POOL_BYTES,
    REGISTRY_STRING_POOL_OFFSET,
};
use std::collections::HashMap;
use std::cell::RefCell;

// 线程级缓存，避免频繁访问 SharedArrayBuffer
thread_local! {
    static ID_CACHE: RefCell<HashMap<String, u32>> = RefCell::new(HashMap::new());
}

/// 清空线程局部 ID 缓存。
/// 在 WASM 模块重新初始化或切换世界时必须调用，以确保 ID 映射的一致性。
pub fn clear_id_cache() {
    ID_CACHE.with(|c| c.borrow_mut().clear());
}

/// 每个条目占用的 i32 数量 (HashLow, HashHigh, ID, Padding)
pub const REGISTRY_ENTRY_INTS: usize = REGISTRY_ENTRY_BYTES / 4;
/// ID 计数器在 Int32Array 中的索引
pub const REGISTRY_HEAD_INTS: usize = REGISTRY_ID_COUNTER_OFFSET / 4;
/// 字符串池计数器在 Int32Array 中的索引
pub const REGISTRY_STRING_COUNTER_INTS: usize = REGISTRY_STRING_COUNTER_OFFSET / 4;
/// 反向查询条目在 Int32Array 中的起始索引
pub const REGISTRY_REVERSE_INTS: usize = REGISTRY_REVERSE_OFFSET / 4;

// FNV-1a 64-bit Hash
/// FNV-1a 64-bit Hash 算法
pub fn hash_state(key: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in key.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// 获取或注册全局唯一 ID
///
/// 使用开放寻址法和 CAS (Compare-And-Swap) 解决冲突。
/// 包含自旋等待逻辑以处理写竞争。
///
/// # Optimization
/// 使用 TLS (Thread Local Storage) 缓存已查询过的 ID，避免重复的 SAB 访问和锁竞争。
pub fn get_or_register(key: &str) -> u32 {
    // 1. Check TLS Cache first
    if let Some(id) = ID_CACHE.with(|c| c.borrow().get(key).copied()) {
        return id;
    }

    // 2. Cache Miss: Access Global Registry
    let id = register_impl(key);

    // 3. Update Cache
    ID_CACHE.with(|c| c.borrow_mut().insert(key.to_string(), id));
    id
}

pub struct SabIds;

impl SabIds {
    pub fn new() -> Self {
        Self
    }
}

impl IdSource for SabIds {
    fn id(&self, key: &str) -> u32 {
        match key {
            "air" | "minecraft:air" | "cave_air" | "minecraft:cave_air" | "void_air" | "minecraft:void_air" => 0,
            _ => get_or_register(key),
        }
    }
}

fn store_reverse_lookup(id: u32, key: &str) {
    if id == 65535 || id as usize >= REGISTRY_ENTRIES {
        return;
    }

    let bytes = key.as_bytes();
    if bytes.is_empty() {
        return;
    }

    if bytes.len() > i32::MAX as usize {
        return;
    }

    let write_offset = get_sab_view_i32(|view| {
        let idx = REGISTRY_STRING_COUNTER_INTS as u32;
        let previous = Atomics::add(view, idx, bytes.len() as i32).unwrap_or(0);
        if previous < 0 {
            return None;
        }

        let offset = previous as usize;
        if offset + bytes.len() > REGISTRY_STRING_POOL_BYTES {
            return None;
        }

        Some(offset)
    });

    let Some(write_offset) = write_offset else {
        crate::runtime_warn!("Registry string pool exhausted while storing {}", key);
        return;
    };

    write_bytes((REGISTRY_STRING_POOL_OFFSET + write_offset) as u32, bytes);

    get_sab_view_i32(|view| {
        let reverse_index = REGISTRY_REVERSE_INTS + (id as usize * 2);
        Atomics::store(view, reverse_index as u32, write_offset as i32).unwrap();
        Atomics::store(view, (reverse_index + 1) as u32, bytes.len() as i32).unwrap();
    });
}

pub fn describe_registered_key(id: u32) -> Option<String> {
    match id {
        0 => return Some("minecraft:air".to_string()),
        _ => {}
    }

    if id as usize >= REGISTRY_ENTRIES {
        return None;
    }

    let (offset, len) = get_sab_view_i32(|view| {
        let reverse_index = REGISTRY_REVERSE_INTS + (id as usize * 2);
        let offset = Atomics::load(view, reverse_index as u32).unwrap_or(0);
        let len = Atomics::load(view, (reverse_index + 1) as u32).unwrap_or(0);
        (offset, len)
    });

    if offset < 0 || len <= 0 {
        return None;
    }

    let offset = offset as usize;
    let len = len as usize;
    if offset + len > REGISTRY_STRING_POOL_BYTES {
        return None;
    }

    let mut bytes = vec![0u8; len];
    read_bytes((REGISTRY_STRING_POOL_OFFSET + offset) as u32, &mut bytes);
    let key = String::from_utf8(bytes).ok()?;
    if key.is_empty() {
        return None;
    }

    if key.contains(':') {
        Some(key)
    } else {
        Some(format!("minecraft:{}", key))
    }
}

fn register_impl(key: &str) -> u32 {
    let h = hash_state(key);
    // Treat u32 bits as i32 for Atomics
    let h_low_raw = (h as u32) as i32;
    let h_high_raw = ((h >> 32) as u32) as i32;

    // Ensure non-zero components to distinguish "Empty/Writing" from "Value"
    let h_low = if h_low_raw == 0 { 1 } else { h_low_raw };
    let h_high = if h_high_raw == 0 { 1 } else { h_high_raw };

    get_sab_view_i32(|view| {
        let mut idx = (h as usize) % REGISTRY_ENTRIES;
        let start_idx = idx;

        loop {
            let entry_offset = idx * REGISTRY_ENTRY_INTS;
            let idx_low = entry_offset as u32;
            let idx_high = (entry_offset + 1) as u32;
            let idx_id = (entry_offset + 2) as u32;

            // Optimistic read
            let stored_low = Atomics::load(view, idx_low).unwrap_or(0);

            // CASE 1: Empty Slot Found
            if stored_low == 0 {
                // Try to claim ownership
                if Atomics::compare_exchange(view, idx_low, 0, h_low).unwrap_or(-1) == 0 {
                    // Win! We own this slot.
                    // Now write High and ID.
                    Atomics::store(view, idx_high, h_high).unwrap();
                    let _ = Atomics::notify(view, idx_high); // Wake up waiters

                    // Allocate ID
                    let counter_idx = REGISTRY_HEAD_INTS as u32;
                    let new_id = Atomics::add(view, counter_idx, 1).unwrap_or(0) + 1;
                    let new_id_u32 = new_id as u32;
                    if new_id_u32 == 65535 || new_id_u32 as usize >= REGISTRY_ENTRIES {
                        crate::runtime_warn!("Registry exhausted while allocating {}", key);
                        Atomics::store(view, idx_id, i32::MAX).unwrap();
                        let _ = Atomics::notify(view, idx_id);
                        return u32::MAX;
                    }
                    store_reverse_lookup(new_id_u32, key);
                    
                    // Store ID
                    Atomics::store(view, idx_id, new_id).unwrap();
                    let _ = Atomics::notify(view, idx_id); // Wake up waiters
                    return new_id_u32;
                }
                // Lost race? The slot is no longer 0.
                // Fallthrough to check if the winner was US (same key) or collision.
            }

            // CASE 2: Slot Occupied (or just claimed by someone else)
            // Re-read low to be sure (though CAS fail or stored_low!=0 gives us a value)
            let current_low = Atomics::load(view, idx_low).unwrap_or(0);
            
            if current_low == h_low {
                 // Low Match. Check High.
                 let mut stored_high = Atomics::load(view, idx_high).unwrap_or(0);
                 
                 // WAIT: If High is 0, it means the writer (who set Low) hasn't written High yet.
                 while stored_high == 0 {
                     // Attempt to sleep to save CPU (returns Err on main thread, which we ignore to fall back to spin)
                     let _ = Atomics::wait(view, idx_high, 0);
                     stored_high = Atomics::load(view, idx_high).unwrap_or(0);
                 }

                 if stored_high == h_high {
                     // Full Match! This is our ID.
                     let mut id = Atomics::load(view, idx_id).unwrap_or(0);
                     while id == 0 {
                         let _ = Atomics::wait(view, idx_id, 0);
                         id = Atomics::load(view, idx_id).unwrap_or(0);
                     }
                     if id == i32::MAX {
                         return u32::MAX;
                     }
                     return id as u32;
                 }
                 // If High != h_high, it's a true collision.
            }

            // Linear Probe
            idx = (idx + 1) % REGISTRY_ENTRIES;
            if idx == start_idx {
                crate::runtime_warn!("Registry full");
                return u32::MAX;
            }
        }
    })
}

