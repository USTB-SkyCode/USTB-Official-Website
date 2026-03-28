//! # Anvil 格式解析模块 (Anvil Parser)
//!
//! ## 职责 (Responsibility)
//! 提供读取和解析 Minecraft Anvil 世界存储格式 (.mca) 的核心功能。
//!
//! ## 包含子模块
//! - [`region`]: 处理 Region 文件 IO 和 Header 解析。
//! - [`chunk`]: 处理 Chunk NBT 结构和垂直分层。
//! - [`section`]: 处理 Section 内部的 Palette 压缩存储。
//! - [`nbt`]: 底层 NBT 二进制解析器。

pub mod region;
pub mod chunk;
pub mod nbt;
pub mod section;
