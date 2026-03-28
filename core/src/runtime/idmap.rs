//! # BlockState 到 BlockId 的字符串映射 (Idmap)
//!
//! ## 职责
//! 提供最小化的运行时字符串到 `BlockId` 映射表。
//! 该结构用于需要按 blockstate key 做快速查找的路径，不承担 SAB 全局注册职责。

use crate::domain::block::BlockId;
use std::collections::HashMap;

/// 简单的字符串键值映射。
/// 当前实现基于 `HashMap<String, BlockId>`，适合宿主侧或初始化期的小规模查询。
pub struct Idmap {
    map: HashMap<String, BlockId>,
}

impl Idmap {
    /// 创建空映射表。
    pub fn new() -> Self {
        Self { map: HashMap::new() }
    }

    /// 读取指定 key 对应的 BlockId。
    pub fn get(&self, key: &str) -> Option<BlockId> {
        self.map.get(key).copied()
    }

    /// 插入或覆盖一个 blockstate key。
    pub fn insert(&mut self, key: String, id: BlockId) {
        self.map.insert(key, id);
    }
}
