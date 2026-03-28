//! # 世界 IO 模块根 (IO Root)
//!
//! ## 职责
//! 汇总与 Minecraft 世界存储读取相关的子模块。
//! 当前主要实现为 `anvil`，负责 Region / Chunk / Section / NBT 的底层解析。

pub mod anvil;
