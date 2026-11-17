#!/bin/bash
# 模板生成快捷脚本
# 用法: ./scripts/generate-template.sh "外卖点餐小程序" commerce mini-program

set -e

BASE="http://localhost:4000"
PROMPT="${1:-外卖点餐小程序}"
CATEGORY="${2:-commerce}"
PLATFORM="${3:-mini-program}"

# 注册临时用户
echo "=== 注册用户 ==="
TOKEN=$(curl -s -X POST "$BASE/api/users/register" \
  -H 'Content-Type: application/json' \
  -d '{"username":"gen-'$(date +%s)'","password":"49cbc143897d40a775f04737d1caa81a83bb26eadd313e5679b75033db016ce3","email":"gen@test.com"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "注册失败"
  exit 1
fi
echo "Token: ${TOKEN:0:20}..."

# 发起模板生成
echo ""
echo "=== 开始生成模板 ==="
echo "提示词: $PROMPT"
echo "品类: $CATEGORY"
echo "平台: $PLATFORM"
echo "（约需 3-8 分钟，请耐心等待）"
echo ""

START=$(date +%s)
curl -s -X POST "$BASE/api/aiTemplates/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"$PROMPT\",\"displayCategory\":\"$CATEGORY\",\"platform\":\"$PLATFORM\"}" \
  -o /tmp/gen_template_result.json

DURATION=$(( $(date +%s) - START ))

# 显示结果
echo "=== 完成（${DURATION}s）==="
python3 -c "
import json
with open('/tmp/gen_template_result.json') as f:
    d = json.load(f)
if 'data' in d:
    r = d['data']
    doc = r.get('document',{})
    b = r.get('brief',{})
    print(f'✅ 模板: {r.get(\"templateId\",\"?\")}')
    print(f'名称: {b.get(\"name\",\"?\")}')
    print(f'原型: {b.get(\"archetype\",\"?\")}/{b.get(\"variant\",\"?\")}')
    print(f'页面: {len(doc.get(\"pages\",[]))}个')
    for p in doc.get('pages',[]):
        kids = (p.get('layout') or {}).get('children',[])
        print(f'  📄 {p[\"id\"]}: {p[\"name\"]} ({len(kids)}个直接子节点)')
    print(f'组件: {len(doc.get(\"components\",[]))}个')
    print(f'图片: {len(doc.get(\"visualAssets\",[]))}个')
    print(f'耗时: {r.get(\"totalDurationMs\",\"?\")}ms')
    print(f'')
    print(f'✅ 生成成功！刷新 http://localhost:3000 即可看到新模板')
else:
    print(f'❌ 错误: {json.dumps(d, indent=2)[:500]}')
" 2>/dev/null