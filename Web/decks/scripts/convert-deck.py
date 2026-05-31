#!/usr/bin/env python3
"""Convert data_N.txt high-yield notes into web-slide JSON decks."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

LAYOUTS = ["left", "right", "center"]
REVEALS = ["left", "right", "up"]


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text[:48].strip("-") or "section"


def row_cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().split("|") if c.strip()]


def is_pipe_table_row(line: str) -> bool:
    s = line.strip()
    if not s or s.startswith(("-", "#", "```", "*")):
        return False
    if re.match(r"^\d+\.\s+", s):
        return False
    return len(row_cells(line)) >= 2


def rows_to_table(rows: list[list[str]]) -> dict | None:
    if len(rows) < 2:
        return None
    header = rows[0]
    body = rows[1:]
    if body and all(re.match(r"^:?-{3,}:?$", c) for c in body[0]):
        body = body[1:]
    if not body:
        return None
    return {"type": "table", "header": header, "rows": body}


def parse_md_table_lines(lines: list[str]) -> dict | None:
    rows = [row_cells(l) for l in lines if row_cells(l)]
    return rows_to_table(rows)


def strip_bullet_prefix(s: str) -> str:
    return re.sub(r"^[-*•]\s+", "", s.strip())


def clean_text_content(s: str) -> str:
    s = s.strip()
    s = re.sub(r"^-{3,}\s+", "", s)
    return s.strip()


def sanitize_items(items: list[str]) -> list[str]:
    return [strip_bullet_prefix(x) for x in items if strip_bullet_prefix(x)]


def merge_orphan_text_blocks(blocks: list[dict]) -> list[dict]:
    """Join short continuation lines (e.g. 'PKC') into the previous group list."""
    out: list[dict] = []
    for block in blocks:
        if block.get("type") == "text" and out and out[-1].get("type") == "group":
            t = clean_text_content(block.get("content", ""))
            items = list(out[-1].get("items") or [])
            if (
                t
                and items
                and len(t.split()) <= 6
                and not t.startswith(("-", "#", "|", "`"))
                and not re.match(r"^\d+\.\s", t)
            ):
                items[-1] = f"{items[-1].rstrip()} {t}".strip()
                out[-1] = {**out[-1], "items": items}
                continue
        if block.get("type") == "text":
            block = {**block, "content": clean_text_content(block.get("content", ""))}
        elif block.get("type") in ("list", "ordered", "group"):
            block = {**block, "items": sanitize_items(block.get("items") or [])}
        out.append(block)
    return out


def normalize_blocks(blocks: list[dict]) -> list[dict]:
    out: list[dict] = []
    for block in blocks:
        if block.get("type") != "group":
            out.append(block)
            continue

        label = block.get("label", "")
        items = sanitize_items(list(block.get("items") or []))

        if " - " in label and re.match(r"^[A-Z]\.\s", label):
            m = re.match(r"^([A-Z]\.\s+.+?)\s+-\s+(.+)$", label)
            if m:
                label = m.group(1).strip()
                items = sanitize_items(
                    [x.strip() for x in m.group(2).split(" - ") if x.strip()]
                ) + items

        if not items:
            out.append({"type": "subheading", "content": label})
        else:
            out.append({"type": "group", "label": label, "items": items})
    return merge_orphan_text_blocks(out)


def join_soft_wraps(lines: list[str]) -> list[str]:
    out: list[str] = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if out and s[0].islower() and not re.search(r"[.!?:\-]$", out[-1].rstrip()):
            out[-1] = out[-1].rstrip() + " " + s
        else:
            out.append(s)
    return out


def parse_bullets(lines: list[str]) -> list[str]:
    items = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s.startswith("- "):
            items.append(strip_bullet_prefix(s))
        elif s.startswith("* "):
            items.append(strip_bullet_prefix(s))
        elif re.match(r"^\d+\.\s+", s):
            items.append(re.sub(r"^\d+\.\s+", "", s).strip())
    return join_soft_wraps(items)


def split_inline_dash_items(text: str) -> tuple[str, list[str]] | None:
    if ":" not in text or " - " not in text:
        return None
    label, rest = text.split(":", 1)
    if not label.strip() or not rest.strip().startswith("- "):
        return None
    items = sanitize_items(
        [x.strip() for x in re.split(r"\s+-\s+", rest.strip()) if x.strip()]
    )
    if not items:
        return None
    return label.strip(), items


def is_continuation_line(ns: str) -> bool:
    if not ns or re.match(r"^-{3,}$", ns):
        return False
    if ns.startswith(("- ", "* ", "#", "```")) or is_pipe_table_row(ns):
        return False
    if re.match(r"^\d+\.\s+[A-Z]", ns):
        return False
    if ":" in ns and " - " in ns:
        return False
    return True


def blocks_from_body(lines: list[str]) -> list[dict]:
    blocks: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if not stripped or stripped in ("---", "====") or re.match(r"^-{3,}$", stripped):
            i += 1
            continue

        if stripped.startswith("```"):
            lang = stripped[3:].strip()
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i].rstrip())
                i += 1
            if i < len(lines):
                i += 1
            content = "\n".join(code_lines).strip()
            if content:
                blocks.append({"type": "text", "content": content})
            continue

        if stripped.lower().startswith("example:") or stripped.lower().startswith("case study:"):
            label = stripped.split(":", 1)[0]
            rest = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
            i += 1
            extra = []
            while i < len(lines):
                nxt = lines[i].strip()
                if not nxt:
                    i += 1
                    break
                if re.match(r"^#{1,3}\s+\d+\.", nxt) or re.match(r"^\d+\.\s+[A-Z]", nxt):
                    break
                if nxt.startswith("- "):
                    extra.append(re.sub(r"^\-\s+", "", nxt))
                    i += 1
                    continue
                if nxt.lower().startswith(("example:", "case study:")):
                    break
                extra.append(nxt)
                i += 1
            text = rest
            if extra:
                text = (text + " " if text else "") + " ".join(extra)
            blocks.append(
                {"type": "example", "content": strip_bullet_prefix(text.strip() or label)}
            )
            continue

        if re.match(r"^[A-Z]\.\s+", stripped) or re.match(r"^###\s+[A-Z]\.", stripped):
            label = re.sub(r"^###\s+", "", stripped)
            peek_i = i + 1
            while peek_i < len(lines) and not lines[peek_i].strip():
                peek_i += 1
            peek = lines[peek_i].strip() if peek_i < len(lines) else ""
            if re.match(r"^###\s+[A-Z]\.", stripped) and (
                not peek or peek.endswith(":") or peek.startswith("```")
            ):
                blocks.append({"type": "subheading", "content": label})
                i += 1
                continue
            i += 1
            group_lines = []
            while i < len(lines):
                nxt = lines[i]
                ns = nxt.strip()
                if not ns or ns == "---":
                    if ns == "---":
                        i += 1
                    break
                if re.match(r"^#{1,3}\s+\d+\.", ns) or re.match(r"^\d+\.\s+[A-Z]", ns):
                    break
                if re.match(r"^[A-Z]\.\s+", ns) or re.match(r"^###\s+[A-Z]\.", ns):
                    break
                if ns.lower().startswith(("example:", "case study:")):
                    break
                group_lines.append(nxt)
                i += 1
            items = parse_bullets(group_lines)
            plain = join_soft_wraps(
                [l.strip() for l in group_lines if l.strip() and not l.strip().startswith("-")]
            )
            if not items and plain:
                items = plain
            blocks.append({"type": "group", "label": label, "items": items})
            continue

        if stripped.endswith(":") and not stripped.startswith("-"):
            label = stripped[:-1]
            i += 1
            group_lines = []
            while i < len(lines):
                nxt = lines[i]
                ns = nxt.strip()
                if not ns:
                    i += 1
                    if group_lines:
                        break
                    continue
                if re.match(r"^#{1,3}\s+\d+\.", ns) or re.match(r"^\d+\.\s+[A-Z]", ns):
                    break
                if ns.endswith(":") and not ns.startswith("-") and group_lines:
                    break
                group_lines.append(nxt)
                i += 1
            items = parse_bullets(group_lines)
            if items:
                blocks.append({"type": "group", "label": label, "items": items})
            elif group_lines:
                table_lines = [l for l in group_lines if l.strip().startswith("|")]
                other_lines = [l for l in group_lines if l.strip() and not l.strip().startswith("|")]
                if other_lines:
                    blocks.append(
                        {
                            "type": "text",
                            "content": label + ": " + " ".join(l.strip() for l in other_lines),
                        }
                    )
                elif label:
                    blocks.append({"type": "text", "content": label + ":"})
                if table_lines:
                    tbl = parse_md_table_lines(table_lines)
                    if tbl:
                        blocks.append(tbl)
                    else:
                        blocks.append(
                            {
                                "type": "text",
                                "content": label + ": " + " ".join(l.strip() for l in group_lines),
                            }
                        )
            continue

        if is_pipe_table_row(stripped):
            table_lines = []
            while i < len(lines) and is_pipe_table_row(lines[i]):
                table_lines.append(lines[i])
                i += 1
            tbl = parse_md_table_lines(table_lines)
            if tbl:
                blocks.append(tbl)
            else:
                blocks.append(
                    {"type": "text", "content": " ".join(l.strip() for l in table_lines)}
                )
            continue

        if stripped.startswith("**") and "→" in stripped:
            para_lines = [stripped]
            i += 1
            while i < len(lines) and lines[i].strip() and not lines[i].strip().startswith("-"):
                if re.match(r"^#{1,3}\s+\d+\.", lines[i].strip()):
                    break
                para_lines.append(lines[i].strip())
                i += 1
            blocks.append({"type": "text", "content": " ".join(para_lines)})
            continue

        inline = split_inline_dash_items(stripped)
        if inline:
            label, items = inline
            i += 1
            while i < len(lines) and is_continuation_line(lines[i].strip()):
                items[-1] = f"{items[-1].rstrip()} {lines[i].strip()}".strip()
                i += 1
            if label.lower() in ("case study", "example"):
                blocks.append({"type": "example", "content": " ".join(items)})
            else:
                blocks.append({"type": "group", "label": label, "items": items})
            continue

        if stripped.startswith("- ") or stripped.startswith("* "):
            list_lines = []
            while i < len(lines):
                ns = lines[i].strip()
                if not ns:
                    i += 1
                    break
                if ns.startswith("- ") or ns.startswith("* "):
                    list_lines.append(lines[i])
                    i += 1
                    continue
                if ns.startswith("  - ") or ns.startswith("    - "):
                    list_lines.append(re.sub(r"^\s+", "", lines[i]))
                    i += 1
                    continue
                if list_lines and (
                    lines[i].startswith((" ", "\t"))
                    or (ns and ns[0].islower() and not ns.startswith("#"))
                ):
                    list_lines[-1] = list_lines[-1].rstrip() + " " + ns
                    i += 1
                    continue
                break
            items = parse_bullets(list_lines)
            if items:
                blocks.append({"type": "list", "items": items})
            continue

        if re.match(r"^\d+\.\s+", stripped) and not re.match(r"^\d+\.\s+[A-Z]", stripped):
            list_lines = []
            while i < len(lines):
                ns = lines[i].strip()
                if re.match(r"^\d+\.\s+", ns):
                    list_lines.append(re.sub(r"^\d+\.\s+", "", ns))
                    i += 1
                    continue
                if not ns:
                    i += 1
                    break
                break
            if list_lines:
                blocks.append({"type": "ordered", "items": list_lines})
            continue

        para = stripped
        i += 1
        while i < len(lines) and lines[i].strip():
            ns = lines[i].strip()
            if ns.startswith(("-", "*", "#", "```")) or is_pipe_table_row(lines[i]):
                break
            if re.match(r"^\d+\.\s+[A-Z]", ns):
                break
            para += " " + ns
            i += 1
        blocks.append({"type": "text", "content": para})
    return normalize_blocks(blocks)


def parse_markdown_sections(text: str) -> tuple[str, str, list[tuple[int, str, list[str]]]]:
    lines = text.splitlines()
    title = ""
    subtitle = "High-Yield Summary"
    start = 0
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith("# ") and not s.startswith("## "):
            title = s[2:].strip()
            start = i + 1
            break
        if s and not s.startswith("#") and i < 3:
            title = s.replace("—", "—").strip()
            start = i + 1
            break

    sections = []
    current = None
    for line in lines[start:]:
        m = re.match(r"^##\s+(?:(\d+)\.\s*)?(.+)$", line.strip())
        if m:
            if current:
                sections.append(current)
            num = int(m.group(1)) if m.group(1) else len(sections) + 1
            current = (num, m.group(2).strip(), [])
            continue
        if current is not None:
            if line.strip() == "---":
                continue
            current[2].append(line)
    if current:
        sections.append(current)
    return title, subtitle, sections


def parse_numbered_sections(text: str) -> tuple[str, str, list[tuple[int, str, list[str]]]]:
    lines = text.splitlines()
    title = ""
    subtitle = "High-Yield Summary"
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if s and not re.match(r"^\d+\.\s+", s) and not s.startswith("-"):
            if not title:
                title = s
            i += 1
            if i < len(lines) and re.match(r"^=+$", lines[i].strip()):
                i += 1
            continue
        break

    sections = []
    current = None
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^(\d+)\.\s+(.+)$", line.strip())
        if m:
            num = int(m.group(1))
            # Nested ordered lists (e.g. pheochromocytoma steps under §5) restart at 1.
            if current is None or num > current[0]:
                if current:
                    sections.append(current)
                current = (num, m.group(2).strip(), [])
                i += 1
                continue
        if current is not None:
            current[2].append(line)
        i += 1
    if current:
        sections.append(current)
    return title, subtitle, sections


def build_deck(deck_id: str, chapter: int, course: str, title: str, subtitle: str, sections_raw) -> dict:
    title = re.sub(r"\s*-\s*Chapter\s+\d+\s*$", "", title, flags=re.I).strip()
    sections = []
    for idx, (num, sec_title, body_lines) in enumerate(sections_raw):
        sid = slugify(f"{num}-{sec_title}")
        blocks = blocks_from_body(body_lines)
        if not blocks:
            blocks = [{"type": "text", "content": "See notes for details."}]
        sections.append(
            {
                "id": sid,
                "number": num,
                "title": sec_title,
                "layout": LAYOUTS[idx % len(LAYOUTS)],
                "reveal": REVEALS[idx % len(REVEALS)],
                "blocks": blocks,
            }
        )
    return {
        "id": deck_id,
        "course": course,
        "chapter": chapter,
        "title": title.split("—")[0].strip() if "—" in title else title,
        "subtitle": subtitle if subtitle else (title.split("—")[-1].strip() if "—" in title else "High-Yield Summary"),
        "sections": sections,
    }


def convert_file(txt_path: Path, deck_id: str, chapter: int, out_name: str):
    text = txt_path.read_text(encoding="utf-8")
    if "## 1." in text or text.strip().startswith("# "):
        title, subtitle, sections = parse_markdown_sections(text)
    else:
        title, subtitle, sections = parse_numbered_sections(text)

    deck = build_deck(deck_id, chapter, "Katzung Pharmacology", title, subtitle, sections)
    out_path = DATA / out_name
    out_path.write_text(json.dumps(deck, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path.name}: {len(deck['sections'])} sections")


def main():
    DATA.mkdir(exist_ok=True)
    mapping = [
        ("data_2.txt", "ch2", 2, "ch2-receptors.json"),
        ("data_3.txt", "ch3", 3, "ch3-pk-pd.json"),
        ("data_4.txt", "ch4", 4, "ch4-biotransform.json"),
        ("data_5.txt", "ch5", 5, "ch5-pharmacogenomics.json"),
        ("data_6.txt", "ch6", 6, "ch6-autonomic.json"),
        ("data_7.txt", "ch7", 7, "ch7-cholinomimetics.json"),
        ("data_8.txt", "ch8", 8, "ch8-antimuscarinic.json"),
        ("data_9.txt", "ch9", 9, "ch9-sympathomimetics.json"),
        ("data_10.txt", "ch10", 10, "ch10-adrenoceptor-antagonists.json"),
    ]
    for txt, deck_id, ch, out in mapping:
        path = ROOT / txt
        if not path.exists():
            print(f"Skip missing {txt}", file=sys.stderr)
            continue
        convert_file(path, deck_id, ch, out)

    import subprocess

    subprocess.run([sys.executable, str(ROOT / "scripts" / "apply_images.py"), "--all"], check=False)


if __name__ == "__main__":
    main()
