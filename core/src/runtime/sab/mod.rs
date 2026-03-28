//! # SharedArrayBuffer 运行时通道 (SAB Root)
//!
//! ## 职责
//! 汇总 SAB 的布局、编解码、生产/消费、客户端视图与全局字符串注册表。
//! 该层负责 Rust 与 TS 之间的共享内存协定，不承担具体业务调度。

pub mod layout;
pub mod client;
pub mod codec;
pub mod producer;
pub mod consumer;
pub mod registry;
