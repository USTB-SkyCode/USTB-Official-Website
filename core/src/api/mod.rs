//! # WebAssembly 导出层 (API Root)
//!
//! ## 职责
//! 汇总所有对 JS/TS 宿主暴露的接口模块。
//! 当前 `api` 只保留 `interface` 入口，用于初始化资源、配置运行时并触发网格生成。

pub mod interface;
