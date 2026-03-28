//! # 网格生成模块 (Mesher)
//!
//! ## 职责 (Responsibility)
//! 实现从原始区块数据 (Chunk Data) 到 GPU 可用顶点数据 (Vertex Data) 的高性能转换算法。
//! 
//! ## 核心流程 (Core Pipeline)
//! 1. **上下文准备**: 收集区块及其邻居的状态（用于面剔除和 AO 计算）。
//! 2. **几何生成**: 针对每个非空气方块，根据其 BlockState 生成对应的面片。
//! 3. **贪婪合并**: (可选) 将邻近的相同材质面片进行合并，减少 DrawCall 顶点数。
//! 4. **编码输出**: 将顶点属性编码为紧凑的交错缓冲区格式。
//!
//! ## 结构 (Structure)
//! - `buffer.rs`: 线程局部输出缓冲管理。
//! - `geometry.rs`: 顶点旋转、UV 锁定、法线辅助。
//! - `lighting.rs`: 光照采样与平滑计算。
//! - `culling.rs`: 渲染层与几何剔除逻辑。
//! - `generator.rs`: 对外 mesh_chunk 入口与主循环。
//! - `greedy.rs`: 贪婪网格生成实现。

pub mod service;
pub mod cache_service;
pub mod types;
pub mod artifacts;
pub mod builders;
pub mod buffer;
pub mod geometry;
pub mod lighting;
pub mod culling;
pub mod context;
pub mod encoding;
pub mod biome;
pub mod generator;
pub mod greedy;
pub mod semantic;
pub mod traits;

pub mod passes;
pub mod services;

pub use artifacts::*;
pub use builders::*;
pub use encoding::*;
pub use semantic::*;
pub use traits::*;
pub use types::*;
pub use generator::{mesh_chunk, mesh_chunk_artifact_with_neighbors_opts, mesh_chunk_with_neighbors, mesh_chunk_with_neighbors_opts};
