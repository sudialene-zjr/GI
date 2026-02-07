#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build processed JSON from local docx/xlsx sources.
Inputs:
  data/患者提问/*.docx
  data/评测集/7. 紧急红线.xlsx
Outputs:
  data/processed/faqs.jsonl
  data/processed/redlines.json
"""
from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from typing import List, Dict, Any, Tuple
from xml.etree import ElementTree as ET


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
OUT_DIR = DATA_DIR / "processed"


def read_docx_paras(path: Path) -> List[str]:
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paras: List[str] = []
    for p in root.findall(".//w:p", ns):
        text = "".join((t.text or "") for t in p.findall(".//w:t", ns)).strip()
        if text:
            paras.append(text)
    return paras


def parse_faq_docx(path: Path) -> List[Dict[str, Any]]:
    paras = read_docx_paras(path)
    faqs: List[Dict[str, Any]] = []
    section: str | None = None
    question: str | None = None
    answer_lines: List[str] = []
    idx = 0

    for line in paras:
        if "？" in line or "?" in line:
            if question and answer_lines:
                idx += 1
                faqs.append(
                    {
                        "id": f"{path.stem}_{idx:03d}",
                        "category": path.stem,
                        "section": section or "",
                        "question": question,
                        "answer": "\n".join(answer_lines).strip(),
                        "source": str(path.relative_to(BASE_DIR)),
                    }
                )
            question = line.strip()
            answer_lines = []
        else:
            if question is None:
                section = line.strip()
            else:
                answer_lines.append(line.strip())

    if question and answer_lines:
        idx += 1
        faqs.append(
            {
                "id": f"{path.stem}_{idx:03d}",
                "category": path.stem,
                "section": section or "",
                "question": question,
                "answer": "\n".join(answer_lines).strip(),
                "source": str(path.relative_to(BASE_DIR)),
            }
        )

    return faqs


def col_to_index(col: str) -> int:
    idx = 0
    for c in col:
        idx = idx * 26 + (ord(c) - 64)
    return idx - 1


def parse_shared_strings(z: zipfile.ZipFile) -> List[str]:
    try:
        xml = z.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(xml)
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    strings: List[str] = []
    for si in root.findall(".//s:si", ns):
        text = "".join(t.text or "" for t in si.findall(".//s:t", ns))
        strings.append(text)
    return strings


def list_sheets(z: zipfile.ZipFile) -> List[Tuple[str, str]]:
    xml = z.read("xl/workbook.xml")
    root = ET.fromstring(xml)
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    sheets: List[Tuple[str, str]] = []
    for sheet in root.findall(".//s:sheet", ns):
        name = sheet.get("name") or ""
        sheet_id = sheet.get(
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        )
        sheets.append((name, sheet_id or ""))
    rel_xml = z.read("xl/_rels/workbook.xml.rels")
    rel_root = ET.fromstring(rel_xml)
    rel_ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
    id_to_target: Dict[str, str] = {}
    for rel in rel_root.findall("r:Relationship", rel_ns):
        rel_id = rel.get("Id")
        target = rel.get("Target")
        if rel_id and target:
            id_to_target[rel_id] = target
    result: List[Tuple[str, str]] = []
    for name, sid in sheets:
        target = id_to_target.get(sid, "")
        if target and not target.startswith("xl/"):
            target = "xl/" + target
        result.append((name, target))
    return result


def parse_sheet(z: zipfile.ZipFile, sheet_path: str, shared: List[str]) -> List[List[str]]:
    xml = z.read(sheet_path)
    root = ET.fromstring(xml)
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows: List[List[str]] = []
    for row in root.findall(".//s:row", ns):
        cells: Dict[int, str] = {}
        for c in row.findall("s:c", ns):
            ref = c.get("r")
            if not ref:
                continue
            m = re.match(r"([A-Z]+)(\d+)", ref)
            if not m:
                continue
            col = m.group(1)
            idx = col_to_index(col)
            t = c.get("t")
            v = c.find("s:v", ns)
            if t == "s" and v is not None and v.text is not None:
                try:
                    s_idx = int(v.text)
                    val = shared[s_idx] if 0 <= s_idx < len(shared) else ""
                except ValueError:
                    val = ""
            elif t == "inlineStr":
                is_elem = c.find("s:is", ns)
                val = (
                    "".join(t_.text or "" for t_ in is_elem.findall(".//s:t", ns))
                    if is_elem is not None
                    else ""
                )
            else:
                val = v.text if v is not None and v.text is not None else ""
            cells[idx] = val
        if cells:
            max_col = max(cells.keys())
            row_vals = [cells.get(i, "") for i in range(max_col + 1)]
            rows.append(row_vals)
    return rows


def split_examples(text: str) -> List[str]:
    parts = re.split(r"[\r\n]+", text or "")
    cleaned = []
    for p in parts:
        s = p.strip()
        if s:
            cleaned.append(s)
    seen = set()
    uniq: List[str] = []
    for s in cleaned:
        if s not in seen:
            uniq.append(s)
            seen.add(s)
    return uniq


def build_redlines(path: Path) -> List[Dict[str, Any]]:
    with zipfile.ZipFile(path) as z:
        shared = parse_shared_strings(z)
        sheets = list_sheets(z)
        if not sheets:
            return []
        _, sheet_path = sheets[0]
        rows = parse_sheet(z, sheet_path, shared)
    if not rows:
        return []
    header = [h.strip() for h in rows[0]]
    header_map = {name: i for i, name in enumerate(header) if name}

    def get(row: List[str], col: str) -> str:
        idx = header_map.get(col)
        if idx is None or idx >= len(row):
            return ""
        return (row[idx] or "").strip()

    redlines: List[Dict[str, Any]] = []
    i = 0
    for row in rows[1:]:
        if not any((c or "").strip() for c in row):
            continue
        i += 1
        examples = split_examples(get(row, "患者问法（示例）"))
        redlines.append(
            {
                "id": f"redline_{i:03d}",
                "category": get(row, "红线子类目"),
                "scene": get(row, "二级场景"),
                "risk_level": get(row, "风险等级") or "红线",
                "must_action": get(row, "必须立即行动") in {"是", "Yes", "Y", "true", "TRUE"},
                "first_line": get(row, "风险判断（必须第一句）"),
                "examples": examples,
                "source": str(path.relative_to(BASE_DIR)),
            }
        )
    return redlines


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    faq_dir = DATA_DIR / "患者提问"
    faq_paths = sorted(faq_dir.glob("*.docx"))
    faqs: List[Dict[str, Any]] = []
    for path in faq_paths:
        faqs.extend(parse_faq_docx(path))

    faqs_path = OUT_DIR / "faqs.jsonl"
    with faqs_path.open("w", encoding="utf-8") as f:
        for item in faqs:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    redline_path = DATA_DIR / "评测集" / "7. 紧急红线.xlsx"
    redlines = build_redlines(redline_path)
    redlines_path = OUT_DIR / "redlines.json"
    with redlines_path.open("w", encoding="utf-8") as f:
        json.dump(redlines, f, ensure_ascii=False, indent=2)

    meta = {
        "faq_count": len(faqs),
        "redline_count": len(redlines),
        "faq_sources": [str(p.relative_to(BASE_DIR)) for p in faq_paths],
        "redline_source": str(redline_path.relative_to(BASE_DIR)),
    }
    with (OUT_DIR / "meta.json").open("w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"Built {len(faqs)} FAQs and {len(redlines)} redlines.")
    print(f"Wrote: {faqs_path}")
    print(f"Wrote: {redlines_path}")


if __name__ == "__main__":
    main()
