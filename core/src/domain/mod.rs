//! # 领域对象模块根 (Domain Root)
//!
//! ## 职责
//! 聚合运行时领域模型，包括 biome、block 与资源解析逻辑。
//! 这些结构为 mesher 提供方块属性、材质语义与生物群系辅助数据。

pub mod biome;
pub mod block;
pub mod resolve;
