# Rust Core 源码结构说明

本目录包含用于高性能区块解析和网格生成的 Rust WASM 核心实现。

## 目录结构详解

### `src/` (根目录)
*   **`lib.rs`**: Crate 入口，声明所有子模块。
*   **`state.rs`**: 全局状态管理。维护线程局部 (ThreadLocal) 的单例，如 `MANAGER` (资源管理器) 和 `CHUNK_CACHE`。
*   **`cache.rs`**: 简单的区块数据缓存实现 (`SliceCache`, `ChunkCache`)，用于减少重复解析开销。
*   **`utils.rs`**: 通用工具函数。

### `sab/` - SharedArrayBuffer 通信
负责 Rust 与 JS 之间的高效数据传输。
*   **`layout.rs`**: 定义 SAB 的内存布局常量 (Registry大小, Slot结构, 偏移量)。
*   **`producer.rs`**: **生产者**。提供 `parse_and_store_chunk`，将解析后的区快数据写入 SAB Slot。
*   **`consumer.rs`**: **消费者**。提供 `mesh_from_sab`，从 SAB Slot 读取数据并生成网格。
*   **`client.rs`**: SAB 读写的底层辅助函数 (Atomics 操作)。
*   **`registry.rs`**: 用于将 Rust 端的 Block Registry 同步写入 SAB。

### `mesher/` - 网格生成核心
最核心的计算密集型模块，负责将 Block 数据转换为 Geometry 数据。
*   **`generator.rs`**: 网格生成主入口。遍历 Chunk -> Section -> Block，收集顶点。
*   **`quads.rs`**: **核心算法**。处理单个方块面的生成 (顶点压缩、AO、平滑光照)。
*   **`culling.rs`**: 面剔除逻辑 (Face Culling)。
*   **`geometry.rs`**: 几何运算 (旋转、UV锁定)。
*   **`lighting.rs`**: 光照数据处理。
*   **`model_cache.rs`**: 运行时模型实例缓存。
*   **`buffer.rs`**: 顶点缓冲区管理。

### `block/` - 方块与资源管理
负责方块的定义、属性和静态资源管理。
*   **`registry.rs`**: (原 manager) `BlockModelManager`，管理 ID 映射和查询。
*   **`model.rs`**: 运行时模型结构 (`BlockModel`)。
*   **`def.rs`**: (原 schema) 资源 JSON 的反序列化结构 (`BlocksJson` 等)。
*   **`resolver.rs`**: 模型解析逻辑 (Multipart, Weighted Random)。
*   **`resources.rs`**: 资源加载辅助。

### `interface/` - WASM API 门面
提供给 JS 调用的顶层导出函数。
*   **`init.rs`**: 初始化 API。
*   **`region.rs`**: Region 读取 API。
*   **`mesh.rs`**: (旧版) 网格生成 API。
*   **`mesh_cached.rs`**: 缓存版 API。

### `anvil/` - 数据解析
负责 Minecraft 原始数据的读取与解析 (Region, Chunk, NBT)。无需改动。

## 顶点格式说明

输出的 Mesh 采用高度压缩的 16 字节顶点格式：

| Word (u32) | 内容 | 详情 |
| :--- | :--- | :--- |
| **0** | Pos X, Y_Low, Z | 坐标压缩 |
| **1** | Normal, Light, Y_High | 法线、光照值、Y高位 |
| **2** | Texture ID, U, V | 纹理层索引及 UV 坐标 |
| **3** | Auxiliary Data | 颜色乘数、各种标志位 |

## 构建命令

```bash
cd ../world;npm run build:wasm (也即 wasm-pack build core --target web --release)
```

