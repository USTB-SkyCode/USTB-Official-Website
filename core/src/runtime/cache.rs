//! ChunkData 缓存模块
//!
//! 职责：在 WASM 侧缓存已解析的 ChunkData，避免重复解压和 NBT 解析。
//! 机制：使用 LRU 策略，容量可配置。

use std::collections::HashMap;
use crate::io::anvil::chunk::ChunkData;

/// 简易 LRU 缓存实现
/// 使用 HashMap + 访问计数器实现近似 LRU
pub struct ChunkCache {
    /// 缓存存储：key = (chunkX, chunkZ)
    chunks: HashMap<(i32, i32), CacheEntry>,
    /// 最大缓存条目数
    capacity: usize,
    /// 全局访问计数器（用于 LRU 排序）
    access_counter: u64,
}

struct CacheEntry {
    chunk: ChunkData,
    last_access: u64,
}

impl ChunkCache {
    /// 创建新的缓存实例
    ///
    /// # 参数
    /// * `capacity` - 最大缓存区块数量
    pub fn new(capacity: usize) -> Self {
        Self {
            chunks: HashMap::with_capacity(capacity),
            capacity,
            access_counter: 0,
        }
    }

    /// 获取缓存的区块数据
    ///
    /// # 参数
    /// * `cx` - 区块 X 坐标
    /// * `cz` - 区块 Z 坐标
    ///
    /// # 返回
    /// 如果缓存命中，返回 ChunkData 的引用
    pub fn get(&mut self, cx: i32, cz: i32) -> Option<&ChunkData> {
        self.access_counter += 1;
        let counter = self.access_counter;

        if let Some(entry) = self.chunks.get_mut(&(cx, cz)) {
            entry.last_access = counter;
            Some(&entry.chunk)
        } else {
            None
        }
    }

    /// 插入区块数据到缓存
    ///
    /// 如果缓存已满，会驱逐最久未访问的条目
    ///
    /// # 参数
    /// * `cx` - 区块 X 坐标
    /// * `cz` - 区块 Z 坐标
    /// * `chunk` - 已解析的 ChunkData
    pub fn insert(&mut self, cx: i32, cz: i32, chunk: ChunkData) {
        self.access_counter += 1;

        // 如果已存在，更新
        if self.chunks.contains_key(&(cx, cz)) {
            self.chunks.insert(
                (cx, cz),
                CacheEntry {
                    chunk,
                    last_access: self.access_counter,
                },
            );
            return;
        }

        // 如果缓存满了，驱逐最旧的条目
        if self.chunks.len() >= self.capacity {
            self.evict_oldest();
        }

        self.chunks.insert(
            (cx, cz),
            CacheEntry {
                chunk,
                last_access: self.access_counter,
            },
        );
    }

    /// 驱逐最久未访问的条目
    fn evict_oldest(&mut self) {
        if let Some((&oldest_key, _)) = self
            .chunks
            .iter()
            .min_by_key(|(_, entry)| entry.last_access)
        {
            self.chunks.remove(&oldest_key);
        }
    }

    /// 批量驱逐距离玩家过远的区块
    ///
    /// # 参数
    /// * `player_cx` - 玩家所在区块 X
    /// * `player_cz` - 玩家所在区块 Z
    /// * `max_distance` - 最大保留距离（切比雪夫距离）
    ///
    /// # 返回
    /// 驱逐的区块数量
    pub fn evict_distant(&mut self, player_cx: i32, player_cz: i32, max_distance: i32) -> usize {
        let keys_to_remove: Vec<(i32, i32)> = self
            .chunks
            .keys()
            .filter(|(cx, cz)| {
                let dx = (cx - player_cx).abs();
                let dz = (cz - player_cz).abs();
                dx.max(dz) > max_distance
            })
            .copied()
            .collect();

        let count = keys_to_remove.len();
        for key in keys_to_remove {
            self.chunks.remove(&key);
        }
        count
    }

    /// 清空缓存
    pub fn clear(&mut self) {
        self.chunks.clear();
        self.access_counter = 0;
    }

    /// 获取当前缓存大小
    pub fn len(&self) -> usize {
        self.chunks.len()
    }

    /// 检查缓存是否为空
    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty()
    }

    /// 检查区块是否在缓存中
    pub fn contains(&self, cx: i32, cz: i32) -> bool {
        self.chunks.contains_key(&(cx, cz))
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_lru_eviction() {
        // 基础 LRU 测试需要 mock ChunkData，这里仅作占位
    }
}
