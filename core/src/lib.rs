//! # Minecraft World Core (Rust)
//!
//! 本库是 Web 版 Minecraft 世界渲染引擎的核心计算层，编译为 WebAssembly (WASM) 运行。
//! 它负责处理高性能计算任务，主要包括：
//!
//! 1. **世界数据解析** (`anvil`): 解析 Minecraft Anvil 格式 (.mca) 文件、NBT 数据、Chunk 以及 Section。
//! 2. **渲染资源管理** (`render`): 解析方块模型 (JSON)、纹理映射 (Texture Mapping) 以及处理 BlockState 变体。
//! 3. **网格生成** (`interface::mesh`, `render::mesher`): 将解析后的区块数据转换为渲染所需的顶点数据 (Geometry)。
//! 4. **光照计算** (`render::lighting`): 占位模块，原有的分块/体素光照已移除。
//! 5. **接口导出** (`interface`): 提供给 JavaScript/TypeScript 调用的 WASM API。
//!
//! # 架构
//!
//! - **JS/TS (前端)**: 负责网络加载、用户输入、WebGL/WebGPU 渲染循环、资源管理。
//! - **Rust (WASM)**: 接收原始二进制数据（如 .mca 文件），返回结构化的渲染数据（如顶点数组）。

pub mod io;
pub mod domain;
pub mod runtime;
pub mod mesher;
pub mod api;
pub mod utils;
pub mod config;

// Re-export generic names for internal convenience during refactor (optional) or just clear them.
// Let's keep the API re-exports working for the generated WASM.
// WASM bindgen functions need to be public.

// Re-export the interface module content or just let it be.
// Originally:
// pub use interface::init::*;
// pub use interface::region::*;
// pub use interface::mesh::*;

pub use api::interface::init::*;
pub use api::interface::region::*;
pub use api::interface::mesh::*;

