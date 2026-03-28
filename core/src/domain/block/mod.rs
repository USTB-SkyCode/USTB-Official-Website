//! Block 核心模块
//! 职责：定义方块数据结构、模型、资源管理及注册表。

pub mod def;       // 原 schema.rs
pub mod binary;    // Binary format support
pub mod model;     // 原 model.rs
pub mod flags;     // model/identity flags
pub mod ids;       // block id source
pub mod registry;  // 原 manager/registry.rs
pub mod resolver;  // 原 manager/resolver.rs
pub mod resources; // 原 manager/resources.rs
pub mod culling;   // New: Culling mask logic
pub mod evaluator; // New: Rule evaluation logic

// 重新导出常用类型
pub use registry::{
    BlockId,
    BlockModelManager,
    CachedBlockProperties,
    FACE_DOWN, FACE_EAST, FACE_NORTH, FACE_SOUTH, FACE_UP, FACE_WEST,
    LAYER_CUTOUT, LAYER_CUTOUT_MIPPED, LAYER_SOLID, LAYER_TRANSLUCENT,
};
pub use ids::{IdSource, LocalIds};
pub use def::*;
pub use model::*;
