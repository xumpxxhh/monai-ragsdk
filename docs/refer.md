**数据索引：**
加载文档 (Document Loading)：

- Multimodal Parsing (多模态 / 复杂文档解析)
- Document Cleaning & Sanitization (文档清洗与净化)
- Metadata Extraction (元数据提取与标注)
  切分成 Chunks (Chunking / Text Splitting)：
- Fixed-Size Chunking with Overlap (固定大小 + 滑动窗口切片)
- Recursive Character Chunking (递归字符切片)
- Semantic Chunking (语义距离切片)
- Structure-Aware / Markdown Chunking (结构感知切片)
- Parent-Child / Hierarchical Chunking (父子/分级块策略)
  转化为嵌入向量 (Embedding)：
- Dense Embedding (稠密向量化)
- Sparse Embedding / Lexical Encoding (稀疏向量化 / 文本编码)
- Context-Aware Embedding / Passage Title Injection (上下文感知向量化)
  存入向量数据库 (Storage & Indexing)：
- Vector Indexing Strategies (向量索引构建策略)
- Hybrid Indexing (混合索引策略)
- Metadata Association & Storage (元数据与原生文本关联)
- Incremental Indexing & Dynamic Upsert (增量索引与更新策略)

**检索前处理 (Pre-Retrieval)：**

- Query Rewrite (查询重写)
- Query Expansion (查询扩展)
- Query Decomposition (查询拆解)
- Multi-Query (多路查询)
- Query Routing (查询路由)
- ...预留各类业务相关的前处理
  **检索操作 (Retrieval)：**
- 相似度算法
- Metadata Filtering (元数据过滤)
- ...预留其他检索（Sparse Retrieval (稀疏检索 / 关键词检索)、Hybrid Search (混合检索)）
  **检索后处理 (Post-Retrieval)：**
- Reranking (重排序)
- Reciprocal Rank Fusion (RRF / 倒数排名融合)
- Context Compression (上下文压缩)
- Lost in the Middle Reordering (首尾重排)
- ...预留各类业务相关的后处理
  **结果生成 (Generation)：**
- Context Injection / Prompt Formatting (上下文注入策略)
- Citation & Attribution (引用溯源)
- Active RAG / Self-Correction (主动检索 / 自纠错)
- Fallback Strategy (兜底策略)
