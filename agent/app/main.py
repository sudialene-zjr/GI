# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.llm import call_qwen
from app.prompts import SYSTEM_PROMPT, REDLINE_TEMPLATE
from app.search import KnowledgeBase


app = FastAPI(title="GI Endoscopy Education API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

kb: Optional[KnowledgeBase] = None


class UserAccount(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    account: Optional[str] = None


class UserProfile(BaseModel):
    name: Optional[str] = None
    birth: Optional[str] = None
    gender: Optional[str] = None
    education: Optional[str] = None
    phone: Optional[str] = None


class SurveyResponse(BaseModel):
    satisfaction: Optional[int] = None
    understanding: Optional[int] = None
    anxiety: Optional[str] = None
    compliance: Optional[Any] = None
    helpful: Optional[str] = None
    suggestion: Optional[str] = None


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    patient_profile: Optional[Dict[str, Any]] = None
    procedure_type: Optional[str] = None
    scheduled_date: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None
    user: Optional[UserAccount] = None
    profile: Optional[UserProfile] = None
    survey: Optional[SurveyResponse] = None


class ChatResponse(BaseModel):
    answer: str
    risk_level: str
    escalate: bool
    sources: List[str]
    matched_redline: Optional[str] = None


def build_user_prompt(req: ChatRequest) -> str:
    parts = [f"用户问题：{req.question}"]
    if req.procedure_type:
        parts.append(f"检查类型：{req.procedure_type}")
    if req.scheduled_date:
        parts.append(f"检查日期：{req.scheduled_date}")
    user_info: Dict[str, Any] = {}

    def _model_to_dict(obj: Any) -> Dict[str, Any]:
        if obj is None:
            return {}
        if hasattr(obj, "model_dump"):
            return obj.model_dump(exclude_none=True)
        return obj.dict(exclude_none=True)

    user = _model_to_dict(req.user)
    profile = _model_to_dict(req.profile)
    survey = _model_to_dict(req.survey)

    if user.get("name"):
        user_info["姓名"] = user["name"]
    if user.get("account"):
        user_info["账号"] = user["account"]

    if profile.get("name") and "姓名" not in user_info:
        user_info["姓名"] = profile["name"]
    if profile.get("birth"):
        user_info["出生年月"] = profile["birth"]
    if profile.get("gender"):
        user_info["性别"] = profile["gender"]
    if profile.get("education"):
        user_info["教育程度"] = profile["education"]
    if profile.get("phone"):
        user_info["联系方式"] = "已提供"

    if req.patient_profile:
        user_info["补充信息"] = req.patient_profile

    if survey:
        user_info["随访反馈"] = survey

    if user_info:
        parts.append(f"用户信息：{user_info}")
    return "\n".join(parts)


@app.on_event("startup")
def _load_kb() -> None:
    global kb
    data_dir = os.getenv("DATA_DIR", "data/processed")
    kb = KnowledgeBase.from_dir(data_dir)


@app.get("/v1/health")
def health() -> Dict[str, Any]:
    return {"status": "ok"}


@app.post("/v1/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    if kb is None:
        raise HTTPException(status_code=500, detail="Knowledge base not loaded")

    q = req.question.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty question")

    redline = kb.match_redline(q)
    if redline:
        first_line = redline.get("first_line") or "存在高风险情况。"
        answer = REDLINE_TEMPLATE.format(first_line=first_line)
        return ChatResponse(
            answer=answer,
            risk_level="redline",
            escalate=True,
            sources=[redline.get("source", "")],
            matched_redline=redline.get("id"),
        )

    hits = kb.search_faqs(q, top_k=4)
    context = kb.build_context(hits)
    sources = [h.item.get("source", "") for h in hits if h.item.get("source")]

    if context:
        system = f"{SYSTEM_PROMPT}\n\n参考资料：\n{context}"
    else:
        system = f"{SYSTEM_PROMPT}\n\n参考资料：无（仅作一般性教育提示）"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": build_user_prompt(req)},
    ]

    try:
        answer = call_qwen(messages)
    except Exception as e:
        answer = f"当前模型服务不可用，请稍后再试或联系医护人员。错误：{e}"

    return ChatResponse(answer=answer, risk_level="normal", escalate=False, sources=sources)
