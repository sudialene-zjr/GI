# -*- coding: utf-8 -*-
from __future__ import annotations

import re
from typing import List, Tuple

from .llm import call_qwen


# Few-shot examples for typo correction
_TYPO_CORRECTION_EXAMPLES = [
    {
        "input": "我需要做左麻醉手术",
        "output": "我需要做麻醉手术",
        "corrections": ["将'左麻醉'纠正为'做麻醉'"]
    },
    {
        "input": "医生说我有胃境检查",
        "output": "医生说我有胃镜检查",
        "corrections": ["将'胃境'纠正为'胃镜'"]
    },
    {
        "input": "肠境和胃镜哪个更疼",
        "output": "肠镜和胃镜哪个更疼",
        "corrections": ["将'肠境'纠正为'肠镜'"]
    },
    {
        "input": "手术前要无疼吗",
        "output": "手术前要无痛吗",
        "corrections": ["将'无疼'纠正为'无痛'"]
    },
    {
        "input": "检查前需要近食吗",
        "output": "检查前需要禁食吗",
        "corrections": ["将'近食'纠正为'禁食'"]
    }
]


def correct_question_text(text: str) -> Tuple[str, List[str]]:
    corrected = str(text or "").strip()
    corrections: List[str] = []
    if not corrected:
        return corrected, corrections

    # Use LLM for few-shot typo correction
    try:
        corrected, corrections = _correct_typos_with_llm(corrected)
    except Exception:
        # Fallback to original text if LLM fails
        pass

    return corrected, corrections


def _correct_typos_with_llm(text: str) -> Tuple[str, List[str]]:
    """Use LLM with few-shot examples to correct typos in medical text."""

    # Build few-shot prompt
    examples_text = ""
    for example in _TYPO_CORRECTION_EXAMPLES:
        examples_text += f"输入: {example['input']}\n"
        examples_text += f"输出: {example['output']}\n"
        examples_text += f"纠正说明: {'; '.join(example['corrections'])}\n\n"

    prompt = f"""你是一个医疗文本错别字纠正助手。请根据以下示例，纠正输入文本中的常见医疗错别字。

示例：
{examples_text}
现在，请纠正以下输入文本中的错别字：
输入: {text}

请以以下格式输出：
输出: [纠正后的文本]
纠正说明: [纠正说明列表，用分号分隔；如果没有错别字则为空]

注意：
- 只纠正明显的错别字，不要改变原意
- 保持医疗术语的准确性
- 如果没有发现错别字，原样输出"""

    messages = [
        {"role": "system", "content": "你是一个专业的医疗文本错别字纠正助手。"},
        {"role": "user", "content": prompt}
    ]

    response = call_qwen(messages)

    # Parse the response
    lines = response.strip().split('\n')
    corrected_text = text  # default fallback
    corrections = []

    for line in lines:
        line = line.strip()
        if line.startswith('输出:'):
            corrected_text = line[3:].strip()
        elif line.startswith('纠正说明:'):
            corrections_str = line[6:].strip()
            if corrections_str and corrections_str != '无':
                corrections = [c.strip() for c in corrections_str.split('；') if c.strip()]

    return corrected_text, corrections
