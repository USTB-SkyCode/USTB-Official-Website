//! # Mesher Pass 汇总模块 (Passes Root)
//!
//! ## 职责
//! 汇总网格生成阶段的 pass 拆分与路由入口。

pub mod quads;
pub mod fluid;
pub mod router;

pub use router::PassRouter;
