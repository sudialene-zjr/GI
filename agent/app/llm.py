# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from typing import List, Dict, Any

import httpx


def call_qwen(messages: List[Dict[str, Any]]) -> str:
    base_url = os.getenv("QWEN_BASE_URL", "").rstrip("/")
    api_key = os.getenv("QWEN_API_KEY", "")
    model = os.getenv("QWEN_MODEL", "qwen3-max")
    chat_path = os.getenv("QWEN_CHAT_PATH", "/chat/completions")
    timeout = float(os.getenv("QWEN_TIMEOUT", "40"))

    if not base_url:
        raise RuntimeError("Missing QWEN_BASE_URL")
    if not api_key:
        raise RuntimeError("Missing QWEN_API_KEY")

    url = f"{base_url}{chat_path}"
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "top_p": 0.8,
        "max_tokens": 800,
    }

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    return data["choices"][0]["message"]["content"]
