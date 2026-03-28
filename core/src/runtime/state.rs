//! 全局状态管理模块
//! 职责：维护 WASM 实例内的全局单例资源（如 BlockModelManager、ChunkCache）。
//! 机制：使用 thread_local! 模拟单例，适应 WASM 单线程模型。

use std::cell::RefCell;
use crate::domain::block::BlockModelManager;
use crate::runtime::cache::ChunkCache;

/// 默认缓存容量：256 个区块（约 16x16 区域）
const DEFAULT_CACHE_CAPACITY: usize = 256;

thread_local! {
    /// 全局唯一的方块模型管理器实例。
    /// 
    /// # Note
    /// 在 JS 调用 `init_resources` 前为 None。
    pub static MANAGER: RefCell<Option<BlockModelManager>> = RefCell::new(None);

    /// 全局 ChunkData 缓存。
    /// 
    /// 缓存已解压/解析的 ChunkData，避免重复 NBT 解析开销。
    /// 在 Worker 初始化时自动创建。
    pub static CHUNK_CACHE: RefCell<ChunkCache> = RefCell::new(ChunkCache::new(DEFAULT_CACHE_CAPACITY));
}
