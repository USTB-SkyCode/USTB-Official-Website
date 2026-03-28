//! WebAssembly 接口模块
//! 职责：定义 Rust Core 与 JS/TS 宿主环境的交互接口。
//! 功能：初始化、Chunk 数据传递、网格生成导出。

pub mod init;
pub mod region;
pub mod mesh;
pub mod mesh_cached;
