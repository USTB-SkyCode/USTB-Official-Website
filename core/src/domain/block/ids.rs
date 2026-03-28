//! # BlockId 分配源 (ID Source)
//!
//! ## 职责
//! 提供方块名称到 `BlockId` 的最小化分配接口。
//! 当前 `LocalIds` 主要用于本地/临时 ID 分配，不负责跨线程或跨运行时一致性。

use std::cell::Cell;

use crate::domain::block::BlockId;

/// ID 分配源接口。
/// 调用方传入稳定 key，返回一个 `BlockId`。
pub trait IdSource {
    fn id(&self, key: &str) -> BlockId;
}

/// 本地递增 ID 分配器。
/// `Cell` 允许在共享引用下自增，适合单线程 WASM 运行时。
pub struct LocalIds {
    next: Cell<BlockId>,
}

impl LocalIds {
    /// 创建从 1 开始的本地 ID 分配器。
    /// 0 保留给 air / cave_air / void_air。
    pub fn new() -> Self {
        Self { next: Cell::new(1) }
    }
}

impl Default for LocalIds {
    fn default() -> Self {
        Self::new()
    }
}

impl IdSource for LocalIds {
    fn id(&self, key: &str) -> BlockId {
        match key {
            // 空气家族统一映射到 0，便于快速 air 判断。
            "air" | "minecraft:air" | "cave_air" | "minecraft:cave_air" | "void_air" | "minecraft:void_air" => 0,
            _ => {
                let current = self.next.get();
                if current == 0xFFFF {
                    // 本地分配器耗尽时返回哨兵值，由上层决定如何处理。
                    return u32::MAX;
                }
                self.next.set(current + 1);
                current
            }
        }
    }
}
