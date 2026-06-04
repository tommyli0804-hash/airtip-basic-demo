# Web 前端

气动触觉执行器的 Demo 应用 —— Leap Motion 手部追踪 + Three.js 3D 场景 + WebSerial 气压输出。

## 架构

```
Leap Motion → leapjs (WS) → 手部骨骼数据
                                ↓
                         Three.js 场景（手部可视化 + 物体碰撞）
                                ↓
                         交互模块（距离 → 气压映射）
                                ↓
                         WebSerial / Mock → MCU
```

## 模块说明

| 文件 | 职责 |
|------|------|
| `src/main.js` | 入口，串联所有模块 |
| `src/scene.js` | Three.js 场景、相机、灯光、可交互物体 |
| `src/leap.js` | Leap Motion 连接与手部数据标准化 |
| `src/interaction.js` | 手指-物体碰撞检测，气压值计算 |
| `src/serial.js` | WebSerial 真实连接 + Mock 模式 |

## 串口协议

帧格式：`[0xAA] [ch0] [ch1] [ch2] [ch3] [ch4] [checksum] [0x55]`

- 5 通道对应 5 根手指，值 0-255
- checksum = (ch0 + ch1 + ch2 + ch3 + ch4) & 0xFF

## 运行

```bash
cd web
npm install
npm run dev
```

需要 Leap Motion 桌面服务运行中（默认 `ws://localhost:6437`）。无 Leap 时场景仍可渲染，手部数据为空。

串口默认 Mock 模式，点击"连接串口"可切换到真实 WebSerial（需 Chrome）。
