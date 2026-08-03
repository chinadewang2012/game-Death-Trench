# Death Trench 2D - 开发工具箱

## 文件夹结构

```
tools/
├── index.html      # 工具入口页面
├── editor.html     # 存档编辑器
├── map-editor.html # 地图编辑器
├── params.html     # 参数调整器
├── prices.html    # 物价调整器
├── mail/           # 信箱系统
│   ├── mail.html   # 信箱主页面
│   └── letters/    # 存放信件 .txt 文件
│       ├── sample1.txt
│       ├── sample2.txt
│       └── sample3.txt
└── README.md       # 本文件
```

## 工具说明

### 📁 存档编辑器 (editor.html)
- 编辑玩家存档数据（金币、击杀、得分、背包物品）
- 存档槽位管理（5个槽位）
- JSON 导入/导出

### 🗺️ 地图编辑器 (map-editor.html)
- 可视化 100×100 网格地图编辑器
- 支持绘制地面、障碍物、掩体、建筑、水域
- 敌人生成点、玩家生成点
- 保存/加载/导出地图

### ⚙️ 参数调整器 (params.html)
- 调整武器、敌人、玩家、地图、掉落、增益参数
- 预设方案：默认/简单/困难/地狱模式
- 实时 DPS 计算和验证警告

### 💰 物价调整器 (prices.html)
- 调整黑市道具价格
- 批量价格调整
- 预设方案：穷人/土豪/挑战/慈善模式

### 📧 信箱系统 (mail/mail.html)
- 读取 `letters/` 文件夹中的 .txt 信件
- 信件切换阅读
- 信件书写功能（保存到 letters/ 文件夹）