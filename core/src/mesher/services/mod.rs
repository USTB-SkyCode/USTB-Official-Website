//! # Mesher 服务模块根 (Services Root)
//!
//! ## 职责
//! 汇总 mesher 在运行期使用的辅助服务，包括邻居读取、遮挡判定与模型缓存。

pub mod neighbor;
pub mod culling;
pub mod model_cache;

pub use neighbor::NeighborAccess;
pub use culling::CullingService;
pub use model_cache::ModelCache;
