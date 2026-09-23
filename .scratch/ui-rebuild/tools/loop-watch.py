"""R15 编排监视：任一子代理记录新增 turn_ended（成功或出错）时输出唤醒行并退出。

用法：python3 loop-watch.py <子代理 id> [...]
"""
import json
import os
import re
import sys
import time

ROOT = os.path.expanduser(
    '~/.cursor/projects/Users-wuqian-project-doupu-doupu/agent-transcripts/'
    '04ac9edd-dbf8-412d-b7e7-12d5fc9e6d51/subagents'
)
IDS = sys.argv[1:]


def read(agent_id):
    try:
        with open(os.path.join(ROOT, f'{agent_id}.jsonl'), encoding='utf-8', errors='ignore') as handle:
            return handle.read()
    except FileNotFoundError:
        return ''


baseline = {agent_id: read(agent_id).count('"type":"turn_ended"') for agent_id in IDS}
while True:
    time.sleep(30)
    for agent_id in IDS:
        text = read(agent_id)
        if text.count('"type":"turn_ended"') > baseline[agent_id]:
            status = (re.findall(r'"type":"turn_ended","status":"(\w+)"', text) or ['unknown'])[-1]
            prompt = f'R15 巡检：子代理 {agent_id} 已结束（{status}），按 progress.md 的恢复方法处理并继续编排'
            print('AGENT_LOOP_WAKE_r15 ' + json.dumps({'prompt': prompt}, ensure_ascii=False), flush=True)
            sys.exit(0)
