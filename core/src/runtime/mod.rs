//! # 运行时基础设施模块 (Runtime Root)
//!
//! ## 职责
//! 汇总 Rust Core 在运行期使用的共享状态、缓存、ID 映射与 SAB 通道。
//! 这些模块不直接产出网格，但为资源生命周期与跨线程数据传输提供基础设施。

pub mod sab;
pub mod state;
pub mod cache;
pub mod idmap;
