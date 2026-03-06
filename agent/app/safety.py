# -*- coding: utf-8 -*-
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class SensitiveSignal:
    signal_id: str
    category: str
    first_line: str
    guidance: str


_RULES = [
    {
        "signal_id": "self_harm",
        "category": "自伤/自杀风险",
        "first_line": "我注意到你提到了可能伤害自己或不想活的想法，这属于紧急风险。",
        "guidance": (
            "请先停止独处，立刻联系身边可信任的人陪伴你。\n"
            "如果存在立即危险，请马上拨打当地急救电话（中国可拨打 110 / 120，美国可拨打 911）。\n"
            "如果你在美国且有自伤危机，可直接拨打或短信联系 988 自杀与危机干预热线。"
        ),
        "patterns": [
            r"不想活",
            r"活着(没意思|没有意义|太累)",
            r"想(死|自杀|轻生)",
            r"(准备|打算|计划|怎么|如何).{0,6}(自杀|轻生|结束生命)",
            r"(割腕|上吊|跳楼|服毒|吞药|了结自己|一了百了)",
            r"(我|自己|家人|朋友).{0,8}(要|想).{0,6}(自杀|轻生|结束生命)",
        ],
    },
    {
        "signal_id": "violence",
        "category": "暴力伤人风险",
        "first_line": "你提到的内容涉及伤害他人，这是高风险行为。",
        "guidance": (
            "我不能提供任何伤人或违法行为的建议。\n"
            "如果你现在有强烈冲动，请立刻远离可能伤人的工具，并联系家人、医生或当地紧急服务。\n"
            "若存在现实危险，请立即拨打当地报警/急救电话（中国 110 / 120，美国 911）。"
        ),
        "patterns": [
            r"(想|要|准备|打算).{0,6}(杀人|砍人|捅人|伤人)",
            r"(报复社会|同归于尽|无差别伤人)",
            r"(教我|告诉我).{0,8}(怎么|如何).{0,6}(杀人|伤人|投毒|纵火|做炸弹)",
            r"(炸(医院|学校|地铁|商场)|投毒|纵火|恐怖袭击)",
        ],
    },
    {
        "signal_id": "public_safety",
        "category": "危害公共安全风险",
        "first_line": "你提到的内容可能危及公共安全，需要立即制止和求助。",
        "guidance": (
            "我不能协助任何危害社会的行为。\n"
            "请立刻停止相关计划，并尽快联系当地警方、急救或心理危机干预服务。\n"
            "若有即时危险，请马上拨打当地紧急电话（中国 110 / 120，美国 911）。"
        ),
        "patterns": [
            r"(报复社会|制造恐慌|随机伤人)",
            r"(怎么|如何).{0,8}(袭击|爆炸|投毒|纵火)",
            r"(带刀|带药|带炸弹).{0,8}(去医院|去学校|去地铁)",
        ],
    },
]

_COMPILED = [
    (
        rule["signal_id"],
        rule["category"],
        rule["first_line"],
        rule["guidance"],
        [re.compile(p) for p in rule["patterns"]],
    )
    for rule in _RULES
]


def detect_sensitive_signal(text: str) -> Optional[SensitiveSignal]:
    query = re.sub(r"\s+", "", str(text or "").lower())
    if not query:
        return None
    for signal_id, category, first_line, guidance, patterns in _COMPILED:
        if any(pattern.search(query) for pattern in patterns):
            return SensitiveSignal(
                signal_id=signal_id,
                category=category,
                first_line=first_line,
                guidance=guidance,
            )
    return None


def build_sensitive_reply(signal: SensitiveSignal) -> str:
    return (
        f"{signal.first_line}\n"
        f"{signal.guidance}\n"
        "如果你愿意，我可以继续陪你梳理一个更安全、可执行的下一步求助清单。"
    )
