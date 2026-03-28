//! # 模型缓存服务 (Model Cache)
//!
//! ## 职责
//! 维护线程局部的方块模型缓存，减少重复的模型查询和 `Rc<BlockModel>` 克隆。
//!
//! ## Strategy
//! - 非变体方块：按 `BlockId` 缓存。
//! - 变体方块：模型依赖 `(x, y, z)`，跳过缓存，按位置动态解析。
//! - 清理策略：缓存超过阈值时直接清空，避免 LRU 的维护成本。

use rustc_hash::FxHashMap;
use std::cell::RefCell;
use std::rc::Rc;
use crate::domain::block::{BlockId, BlockModelManager};
use crate::domain::block::model::BlockModel;

pub type ModelCache = FxHashMap<BlockId, Rc<BlockModel>>;

thread_local! {
    /// 线程局部模型缓存实例。
    pub static MODEL_CACHE: RefCell<ModelCache> = RefCell::new(FxHashMap::default());
}

/// 触发清理的缓存条目上限。
const MODEL_CACHE_CAPACITY: usize = 8192;

/// 获取方块模型。
/// 
/// # Parameters
/// - `cache`: 可变缓存引用。
/// - `manager`: 模型管理器。
/// - `id`: 方块 ID。
/// - `x, y, z`: 方块世界坐标 (用于变体计算)。
/// 
/// # Returns
/// - `Option<Rc<BlockModel>>`: 模型的智能指针。
pub fn fetch_cached_model(
    cache: &mut FxHashMap<BlockId, Rc<BlockModel>>,
    manager: &BlockModelManager,
    id: BlockId,
    x: i32,
    y: i32,
    z: i32,
) -> Option<Rc<BlockModel>> {
    // 先判断是否为变体方块。
    let props = manager.get_properties_by_id(id)?;
    
    if !props.has_variants {
        // 静态方块优先读缓存。
        if let Some(m) = cache.get(&id) {
            return Some(m.clone());
        }
        // 未命中时回源到 manager，并写入缓存。
        if let Some(m) = manager.get_model_by_id(id) {
            cache.insert(id, m.clone());
            return Some(m);
        }
        return None;
    }
    
    // 变体方块跳过缓存：位置参与选模，按 `(id,x,y,z)` 建 key 的收益较低。
    manager.get_model_dynamic(id, x, y, z)
}

/// 检查缓存容量并在超限时执行缩容/清理。
/// 建议在每个 Chunk 处理开始前调用。
#[inline]
pub fn maybe_shrink_model_cache(cache: &mut FxHashMap<BlockId, Rc<BlockModel>>) {
    if cache.len() > MODEL_CACHE_CAPACITY {
        // 简单策略：直接清空，避免复杂驱逐算法带来的额外 CPU 开销。
        cache.clear();
        cache.reserve(2048);
    }
}
