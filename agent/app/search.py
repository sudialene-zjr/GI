# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional


def is_cjk(ch: str) -> bool:
    return "一" <= ch <= "鿿"


def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[^\w一-鿿]+", "", text)
    return text


def tokenize(text: str) -> List[str]:
    text = normalize(text)
    tokens: List[str] = []
    cjk_buf: List[str] = []
    ascii_buf: List[str] = []

    def flush_cjk() -> None:
        nonlocal cjk_buf, tokens
        if not cjk_buf:
            return
        s = "".join(cjk_buf)
        if len(s) == 1:
            tokens.append(s)
        else:
            tokens.extend([s[i : i + 2] for i in range(len(s) - 1)])
        cjk_buf = []

    def flush_ascii() -> None:
        nonlocal ascii_buf, tokens
        if not ascii_buf:
            return
        tokens.append("".join(ascii_buf))
        ascii_buf = []

    for ch in text:
        if is_cjk(ch):
            flush_ascii()
            cjk_buf.append(ch)
        elif ch.isalnum():
            flush_cjk()
            ascii_buf.append(ch)
        else:
            flush_cjk()
            flush_ascii()

    flush_cjk()
    flush_ascii()
    return tokens


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = a & b
    union = a | b
    return len(inter) / len(union)


@dataclass
class SearchHit:
    item: Dict[str, Any]
    score: float


class KnowledgeBase:
    def __init__(self, faqs: List[Dict[str, Any]], redlines: List[Dict[str, Any]]):
        self.faqs = faqs
        self.redlines = redlines
        self._faq_tokens: List[set[str]] = []
        for f in self.faqs:
            base = " ".join([f.get("question", ""), f.get("section", ""), f.get("answer", "")])
            self._faq_tokens.append(set(tokenize(base)))

        self._redline_examples: List[List[Tuple[str, set[str]]]] = []
        for r in self.redlines:
            examples = r.get("examples", []) or []
            bucket: List[Tuple[str, set[str]]] = []
            for ex in examples:
                ex_norm = normalize(ex)
                bucket.append((ex_norm, set(tokenize(ex))))
            self._redline_examples.append(bucket)

    @classmethod
    def from_dir(cls, path: str | Path) -> "KnowledgeBase":
        path = Path(path)
        faqs_path = path / "faqs.jsonl"
        redlines_path = path / "redlines.json"

        faqs: List[Dict[str, Any]] = []
        with faqs_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                faqs.append(json.loads(line))

        with redlines_path.open("r", encoding="utf-8") as f:
            redlines = json.load(f)

        return cls(faqs=faqs, redlines=redlines)

    def match_redline(self, query: str, threshold: float = 0.32) -> Optional[Dict[str, Any]]:
        q = normalize(query)
        q_tokens = set(tokenize(q))
        best: Optional[Dict[str, Any]] = None
        best_score = 0.0

        for r, examples in zip(self.redlines, self._redline_examples):
            for ex_norm, ex_tokens in examples:
                if ex_norm and ex_norm in q:
                    return r
                score = jaccard(q_tokens, ex_tokens)
                if score > best_score:
                    best_score = score
                    best = r

        if best_score >= threshold:
            return best
        return None

    def search_faqs(self, query: str, top_k: int = 4, min_score: float = 0.06) -> List[SearchHit]:
        q = normalize(query)
        q_tokens = set(tokenize(q))
        hits: List[SearchHit] = []
        for faq, tokens in zip(self.faqs, self._faq_tokens):
            score = jaccard(q_tokens, tokens)
            if faq.get("question") and q and q in normalize(faq["question"]):
                score += 0.2
            if score >= min_score:
                hits.append(SearchHit(item=faq, score=score))
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:top_k]

    @staticmethod
    def build_context(hits: List[SearchHit]) -> str:
        lines: List[str] = []
        for i, hit in enumerate(hits, 1):
            item = hit.item
            lines.append(
                f"[{i}] Q: {item.get('question','')}\nA: {item.get('answer','')}\n来源: {item.get('source','')}"
            )
        return "\n\n".join(lines)
