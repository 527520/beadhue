"""R15 编排常驻监视：盯住本会话全部子代理记录（含之后新派发的），
任一记录新增 turn_ended（成功或出错）即输出唤醒行；另按固定间隔输出心跳唤醒行。进程不退出。

唤醒行带递增序号（`AGENT_LOOP_WAKE_r15 #N HH:MM:SS {...}`）：后台通知在主会话空闲时不会开启新回合，
主会话改为在回合内用 AwaitShell 按序号等下一条（pattern 会匹配整份输出，所以必须带序号）。

用法：python3 loop-watch.py [心跳秒数，默认 1200]
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
HEARTBEAT = int(sys.argv[1]) if len(sys.argv) > 1 else 1200
ENDED = re.compile(r'"type":"turn_ended","status":"(\w+)"')


def snapshot():
    counts = {}
    for name in os.listdir(ROOT):
        if name.endswith('.jsonl'):
            try:
                with open(os.path.join(ROOT, name), encoding='utf-8', errors='ignore') as handle:
                    counts[name[:-6]] = ENDED.findall(handle.read())
            except OSError:
                continue
    return counts


seq = 0


def wake(prompt):
    global seq
    seq += 1
    stamp = time.strftime('%H:%M:%S')
    print(f'AGENT_LOOP_WAKE_r15 #{seq} {stamp} ' + json.dumps({'prompt': prompt}, ensure_ascii=False), flush=True)


seen = {agent_id: len(statuses) for agent_id, statuses in snapshot().items()}
last_beat = time.time()
while True:
    time.sleep(30)
    for agent_id, statuses in snapshot().items():
        if len(statuses) > seen.get(agent_id, 0):
            seen[agent_id] = len(statuses)
            wake(f'R15 巡检：子代理 {agent_id} 已结束（{statuses[-1]}），按 progress.md 的恢复方法处理并继续编排')
    if time.time() - last_beat >= HEARTBEAT:
        last_beat = time.time()
        wake('R15 巡检（心跳）：读 progress.md，检查运行中子代理是否结束或卡住，按恢复方法处理并继续编排')
