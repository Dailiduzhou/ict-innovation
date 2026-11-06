# 项目书插图

4 张图的 PNG 由 Mermaid 源文件渲染，图注中已注明对应的 `.mmd` 文件。

## 重新渲染

```bash
# 依赖装在仓库外的临时目录，避免污染项目
mkdir -p /tmp/mmd && cd /tmp/mmd && bun init -y
bun add @mermaid-js/mermaid-cli

# mermaid-cli v12 用 --size（旧版是 -w），并用 -p 指定 chromium
printf '%s' '{"executablePath":"C:/Program Files/Google/Chrome/Application/chrome.exe","args":["--no-sandbox"]}' > pptr.json

cd <仓库>/assets/项目书
mmdc -i 图1-总体架构.mmd -o 图1-总体架构.png -b white --size 2600 -s 2 -p /tmp/mmd/pptr.json
```

说明：
- `--size` 控制输出最大边长，`-s` 是设备像素比；架构图建议 `--size 2600`，时序图 `--size 2200`。
- `pptr.json` 里的路径必须用**正斜杠**，反斜杠会被 JSON 解析成非法转义。
- 图 1 为无环分层布局：为了让 Mermaid 排出「①端 → ②接入 → ③云 → ④回到端」的顺序，端侧节点在输入侧与输出侧各出现一次，这是有意的重复，不是笔误。
