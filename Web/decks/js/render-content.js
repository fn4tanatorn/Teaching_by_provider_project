/**
 * โหลด data/ch*.json แล้วสร้างสไลด์ + nav (+ รูปจาก data_N/)
 */
(function () {
    const LAYOUTS = ["left", "right", "center"];
    const REVEALS = ["left", "right", "up"];
    const DATA_VERSION = "20260525-ch7-no-flashcards";

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function normalizeListItem(text) {
        return String(text)
            .trim()
            .replace(/^[-*•]\s+/, "");
    }

    function formatInline(str) {
        return escapeHtml(normalizeListItem(str)).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    }

    function parseInlineDashList(content) {
        const trimmed = String(content).trim();
        const m = trimmed.match(/^([^:]+):\s*-\s+(.+)$/s);
        if (!m || trimmed.includes("\n")) return null;
        const label = m[1].trim();
        const items = m[2]
            .split(/\s+-\s+/)
            .map((s) => normalizeListItem(s))
            .filter(Boolean);
        return items.length ? { label, items } : null;
    }

    function isTableSeparatorRow(cells) {
        return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
    }

    function normalizeFlattenedTable(text) {
        if (text.includes("\n")) return text;
        return text.replace(/\|\s+\|(?=\s*(?:[-:]|[^|\s]))/g, "|\n|");
    }

    function parsePipeTableRows(text) {
        const normalized = normalizeFlattenedTable(text.trim());
        const lineRows = normalized
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.startsWith("|"))
            .map((line) =>
                line
                    .split("|")
                    .slice(1, -1)
                    .map((c) => c.trim())
            )
            .filter((cells) => cells.length > 0);

        if (lineRows.length < 2) return null;

        let header = lineRows[0];
        let body = lineRows.slice(1);
        if (body.length && isTableSeparatorRow(body[0])) {
            body = body.slice(1);
        }
        if (!body.length) return null;

        return { header, rows: body, consumed: text.length };
    }

    function renderTableHtml(header, rows) {
        const headHtml = header
            .map((cell) => `<th scope="col">${formatInline(cell)}</th>`)
            .join("");
        const bodyHtml = rows
            .map(
                (row) =>
                    `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join("")}</tr>`
            )
            .join("");
        return `
            <div class="slide-table-wrap">
                <table class="slide-table">
                    <thead><tr>${headHtml}</tr></thead>
                    <tbody>${bodyHtml}</tbody>
                </table>
            </div>`;
    }

    function splitContentWithTables(content) {
        const str = String(content);
        const segments = [];
        let i = 0;

        while (i < str.length) {
            const slice = str.slice(i);
            const tableStart = slice.search(/\|(?:\s*[^|]+\s*\|)+/);
            if (tableStart === -1) {
                const tail = slice.trim();
                if (tail) segments.push({ type: "text", content: tail });
                break;
            }

            const absStart = i + tableStart;
            const prefix = str.slice(i, absStart).trim();
            if (prefix) segments.push({ type: "text", content: prefix });

            const parsed = parsePipeTableRows(str.slice(absStart));
            if (!parsed) {
                const tail = str.slice(i).trim();
                if (tail) segments.push({ type: "text", content: tail });
                break;
            }

            segments.push({ type: "table", header: parsed.header, rows: parsed.rows });
            i = absStart + parsed.consumed;
        }

        return segments.length ? segments : [{ type: "text", content: str }];
    }

    function formatPlainText(content) {
        let s = escapeHtml(String(content));
        s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        s = s.replace(/```(?:text)?\s*([\s\S]*?)```/g, (_, code) => {
            const body = code.trim().replace(/^\n+|\n+$/g, "");
            return `<pre class="slide-code"><code>${body}</code></pre>`;
        });
        s = s.replace(/^###\s+/gm, "");
        return s;
    }

    function formatTextContent(content) {
        return splitContentWithTables(content)
            .map((seg) => {
                if (seg.type === "table") {
                    return renderTableHtml(seg.header, seg.rows);
                }
                const inline = parseInlineDashList(seg.content);
                if (inline) {
                    return `
                        <div class="slide-block slide-block--inline">
                            <h3 class="slide-subheading">${formatInline(inline.label)}</h3>
                            <ul class="slide-list">
                                ${inline.items.map((item) => `<li><span>${formatInline(item)}</span></li>`).join("")}
                            </ul>
                        </div>`;
                }
                const plain = formatPlainText(seg.content).trim();
                return plain ? `<p class="slide-text-para">${plain}</p>` : "";
            })
            .join("");
    }

    function looksLikeListHeading(item) {
        return /:\s*$/.test(String(item).trim());
    }

    function buildListTree(items = []) {
        const tree = [];
        let activeParent = null;

        for (const item of items) {
            const text = normalizeListItem(item);
            const node = { text, children: [] };

            if (looksLikeListHeading(text)) {
                tree.push(node);
                activeParent = node;
                continue;
            }

            if (activeParent) {
                activeParent.children.push(node);
            } else {
                tree.push(node);
            }
        }

        return tree;
    }

    function renderListNode(node) {
        const childrenHtml = node.children?.length
            ? `<ul class="slide-sublist">${node.children.map(renderListNode).join("")}</ul>`
            : "";
        const headingClass = node.children?.length ? ` class="slide-list-label"` : "";
        const itemClass = node.children?.length ? ` class="slide-list-parent"` : "";
        return `<li${itemClass}><span${headingClass}>${formatInline(node.text)}</span>${childrenHtml}</li>`;
    }

    function renderListItems(items = []) {
        return buildListTree(items).map(renderListNode).join("");
    }

    const MAX_BLOCK_WEIGHT = 7;
    const MAX_BLOCK_WEIGHT_WITH_IMAGE = 6;
    const MAX_LIST_ITEMS_WITH_IMAGE = 14;
    const MAX_LIST_ITEMS_NO_IMAGE = 12;
    const MAX_GROUP_ITEMS_WITH_IMAGE = 14;
    const MAX_TABLE_ROWS_WITH_IMAGE = 8;
    const MAX_TABLE_ROWS_NO_IMAGE = 14;
    /** แตกหน้าที่หัวข้อย่อยเมื่อหน้าปัจจุบันมีเนื้อหาอย่างน้อยเท่านี้ (weight) */
    const MIN_WEIGHT_BEFORE_TOPIC_BREAK = 3;

    function normalizeGroupBlock(block) {
        if (block.type !== "group") return block;
        let { label, items = [] } = block;
        if (/^[A-Z]\.\s/.test(label) && label.includes(" - ")) {
            const m = label.match(/^([A-Z]\.\s+.+?)\s+-\s+(.+)$/s);
            if (m) {
                label = m[1].trim();
                items = m[2]
                    .split(/\s+-\s+/)
                    .map((s) => normalizeListItem(s))
                    .filter(Boolean)
                    .concat(items);
            }
        }
        return { ...block, label, items };
    }

    function blockWeight(block) {
        switch (block.type) {
            case "list":
                return 1.2 + block.items.length * 0.45;
            case "ordered":
                return 1.2 + block.items.length * 0.45;
            case "group":
                return 1.4 + block.items.length * 0.45;
            case "text": {
                const content = block.content || "";
                if (/```/.test(content)) return 3.2;
                if (content.length > 140) return 2.6;
                return 1.3;
            }
            case "example":
                return 2;
            case "table":
                return 2 + (block.rows?.length || 0) * 0.45;
            case "subheading":
                return 1.2;
            default:
                return 1;
        }
    }

    /** หัวข้อย่อยที่ควรแตกหน้า — ไม่รวม A./B./C. drug groups (ให้รวมจนเต็มหน้าแทน) */
    function isTopicStart(block) {
        if (block.type === "text") {
            const t = block.content.trim();
            return /^###\s+/.test(t);
        }
        if (block.type === "group") {
            const label = block.label.trim();
            if (/^M\d/i.test(label)) return true;
        }
        return false;
    }

    /** แยก list ยาว (เช่น High-Yield ทั้งบท) ตามหัวข้อลงท้ายด้วย : และจำกัดจำนวนข้อต่อหน้า */
    function splitLongListBlock(block, maxItems) {
        if (block.type !== "list" && block.type !== "ordered") return [block];
        const items = block.items || [];
        if (items.length <= maxItems) return [block];

        const segments = [];
        let current = [];

        const flush = () => {
            if (current.length) {
                segments.push({ type: block.type, items: [...current] });
                current = [];
            }
        };

        for (const item of items) {
            const isHeading = looksLikeListHeading(item);
            if (isHeading && current.length) flush();
            current.push(item);
            const onlyHeading = current.length === 1 && isHeading;
            if (!onlyHeading && current.length >= maxItems) flush();
        }
        flush();

        // Fix orphan: if last segment has only 1 item, borrow one from the previous segment
        if (segments.length >= 2 && segments[segments.length - 1].items.length === 1) {
            const prev = segments[segments.length - 2];
            const last = segments[segments.length - 1];
            if (prev.items.length > 1) {
                last.items.unshift(prev.items.pop());
            }
        }

        return segments.length > 1 ? segments : [block];
    }

    function expandLongLists(blocks, section) {
        const maxItems = section?.image ? MAX_LIST_ITEMS_WITH_IMAGE : MAX_LIST_ITEMS_NO_IMAGE;
        const out = [];
        for (const block of blocks) {
            if (block.type === "list" || block.type === "ordered") {
                out.push(...splitLongListBlock(block, maxItems));
            } else {
                out.push(block);
            }
        }
        return out;
    }

    function isItemHeading(item) {
        const t = String(item).trim();
        return looksLikeListHeading(t) || (/^[A-Z0-9][^:]{0,48}:\s*$/.test(t) && !t.includes(" - "));
    }

    function splitLongGroupBlock(block, maxItems) {
        const items = block.items || [];
        if (items.length <= maxItems) return [block];

        const segments = [];
        let current = [];
        let segmentLabel = block.label;

        const flush = () => {
            if (!current.length) return;
            segments.push({ type: "group", label: segmentLabel, items: [...current] });
            current = [];
        };

        for (const item of items) {
            if (isItemHeading(item) && current.length > 0) {
                flush();
                const head = String(item).trim().replace(/:$/, "");
                segmentLabel = block.label.includes("—") ? `${block.label}, ${head}` : `${block.label} — ${head}`;
            }
            current.push(item);
            const onlyHeading = current.length === 1 && isItemHeading(item);
            if (!onlyHeading && current.length >= maxItems) {
                flush();
                segmentLabel = block.label;
            }
        }
        flush();

        // Fix orphan: if last segment has only 1 item, borrow one from the previous segment
        if (segments.length >= 2 && segments[segments.length - 1].items.length === 1) {
            const prev = segments[segments.length - 2];
            const last = segments[segments.length - 1];
            if (prev.items.length > 1) {
                last.items.unshift(prev.items.pop());
            }
        }

        return segments.length > 1 ? segments : [block];
    }

    function expandLongGroups(blocks, section) {
        const compact = Boolean(section?.image) && totalBlocksWeight(blocks) <= 16;
        const maxItems = section?.image ? (compact ? 12 : MAX_GROUP_ITEMS_WITH_IMAGE) : 14;
        const out = [];
        for (const block of blocks) {
            if (block.type === "group") {
                out.push(...splitLongGroupBlock(block, maxItems));
            } else {
                out.push(block);
            }
        }
        return out;
    }

    function splitLongTableBlock(block, maxRows) {
        if (block.type !== "table") return [block];
        const rows = block.rows || [];
        if (rows.length <= maxRows) return [block];
        const parts = [];
        for (let i = 0; i < rows.length; i += maxRows) {
            parts.push({
                type: "table",
                header: block.header,
                rows: rows.slice(i, i + maxRows),
            });
        }
        return parts;
    }

    function expandLongTables(blocks, section) {
        const maxRows = section?.image ? MAX_TABLE_ROWS_WITH_IMAGE : MAX_TABLE_ROWS_NO_IMAGE;
        const out = [];
        for (const block of blocks) {
            if (block.type === "table") {
                out.push(...splitLongTableBlock(block, maxRows));
            } else {
                out.push(block);
            }
        }
        return out;
    }

    function isRapidReviewSection(section) {
        return /rapid\s+review/i.test(section?.title || "");
    }

    /** หัวข้อที่ควรสอนแนวคิดก่อน แล้วค่อยตารางอ้างอิง (ไม่โชว์ TABLE หน้าแรก) */
    function isConceptFirstSection(section) {
        return section?.id === "weak-acids-bases";
    }

    function planConceptFirstPages(blocks, section) {
        if (!isConceptFirstSection(section)) return null;
        const intro = blocks.filter((b) => b.type === "text");
        const body = blocks.filter((b) => b.type !== "text");
        if (!intro.length) return null;
        return [intro, body.length ? body : [], []];
    }

    /** แยก group ใหญ่ (เช่น M1/M2/M3 ใน list เดียว) เป็นหลาย group */
    function expandDenseGroups(blocks) {
        const expanded = [];
        const subtypeHeader = /^(M[1-5](?:\s*\/\s*M[1-5])?|Nm|Nn)\s*:?\s*$/i;

        for (const block of blocks) {
            if (block.type !== "group" || block.items.length < 6) {
                expanded.push(block);
                continue;
            }

            const headerCount = block.items.filter((item) => subtypeHeader.test(item.trim())).length;
            if (headerCount < 2) {
                expanded.push(block);
                continue;
            }

            let current = { type: "group", label: block.label, items: [] };
            let split = false;

            for (const item of block.items) {
                const text = item.trim();
                if (subtypeHeader.test(text)) {
                    if (current.items.length) {
                        expanded.push({ type: "group", label: current.label, items: [...current.items] });
                        split = true;
                    }
                    current = { type: "group", label: text.replace(/:$/, ""), items: [] };
                } else {
                    current.items.push(item);
                }
            }
            if (current.items.length) {
                expanded.push({ type: "group", label: current.label, items: [...current.items] });
            }
            if (!split) expanded.push(block);
        }

        return expanded;
    }

    function totalBlocksWeight(blocks) {
        return blocks.reduce((sum, b) => sum + blockWeight(b), 0);
    }

    /** หัวข้อสั้นๆ (เช่น Drug Properties) ใส่รวมได้มากกว่าหัวข้อยาวๆ */
    function effectiveMaxWeight(section, blocks) {
        if (!section?.image) return MAX_BLOCK_WEIGHT;
        const total = totalBlocksWeight(blocks);
        const n = blocks.length;
        if (total <= 12 && n <= 4) return 11;
        if (total <= 22 && n <= 8) return 8;
        return MAX_BLOCK_WEIGHT_WITH_IMAGE;
    }

    function needsSoloPage(block) {
        if (block.type === "table") {
            return (block.rows || []).length > MAX_TABLE_ROWS_WITH_IMAGE;
        }
        if (block.type === "group") {
            return (
                (block.items || []).length > MAX_GROUP_ITEMS_WITH_IMAGE ||
                blockWeight(block) > 6
            );
        }
        return false;
    }

    /** ชื่อยา / หัวข้อสั้น ที่ควรอยู่คู่กับ list, group หรือ table ถัดไป */
    function isShortHeading(block) {
        if (block.type !== "text") return false;
        const t = (block.content || "").trim();
        return t.length > 0 && t.length <= 56 && !/^#{1,3}\s/.test(t) && !t.includes("\n");
    }

    function isPairedContentBlock(block) {
        return (
            block &&
            (block.type === "list" ||
                block.type === "ordered" ||
                block.type === "group" ||
                block.type === "table")
        );
    }

    /** รวม heading + list/group/table เป็นหน่วยเดียวก่อนแบ่งหน้า */
    function blocksToUnits(blocks) {
        const units = [];
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const next = blocks[i + 1];
            if (isShortHeading(block) && isPairedContentBlock(next)) {
                units.push({
                    blocks: [block, next],
                    weight: blockWeight(block) + blockWeight(next),
                    solo: needsSoloPage(next),
                    topicStart: isTopicStart(block) || isTopicStart(next),
                });
                i++;
            } else {
                units.push({
                    blocks: [block],
                    weight: blockWeight(block),
                    solo: needsSoloPage(block),
                    topicStart: isTopicStart(block),
                });
            }
        }
        return units;
    }

    /** แบ่ง blocks เป็นหลายหน้า — แยกเมื่อเต็มหน้า หรือ block ใหญ่มาก */
    function chunkBlocks(blocks, section) {
        blocks = expandLongLists(blocks, section);
        blocks = expandLongGroups(blocks, section);
        blocks = expandLongTables(blocks, section);
        blocks = expandDenseGroups(blocks);
        if (!blocks?.length) return [[]];
        if (blocks.length <= 3 && !section?.image) return [blocks];

        const maxWeight = effectiveMaxWeight(section, blocks);
        const units = blocksToUnits(blocks);
        const pages = [];
        let current = [];
        let weight = 0;

        for (const unit of units) {
            const wouldOverflow = weight + unit.weight > maxWeight;
            const soloPageBreak = current.length > 0 && unit.solo;
            const topicBreak =
                unit.topicStart && (wouldOverflow || weight >= MIN_WEIGHT_BEFORE_TOPIC_BREAK);
            const shouldBreak =
                current.length > 0 && (soloPageBreak || wouldOverflow || topicBreak);

            if (shouldBreak) {
                pages.push(current);
                current = [];
                weight = 0;
            }
            current.push(...unit.blocks);
            weight += unit.weight;
        }
        if (current.length) pages.push(current);
        return pages.length > 1 ? pages : [blocks];
    }

    function renderBlock(block, delayBase) {
        switch (block.type) {
            case "list":
                return `
                    <ul class="slide-list reveal-item" data-delay="${delayBase}">
                        ${renderListItems(block.items)}
                    </ul>`;
            case "ordered":
                return `
                    <ol class="slide-list slide-list--ordered reveal-item" data-delay="${delayBase}">
                        ${renderListItems(block.items)}
                    </ol>`;
            case "subheading":
                return `<h3 class="slide-subheading reveal-item" data-delay="${delayBase}">${formatInline(block.content)}</h3>`;
            case "text": {
                const trimmed = block.content.trim();
                const heading = trimmed.match(/^###\s+(.+)$/);
                if (heading) {
                    return `<h3 class="slide-subheading reveal-item" data-delay="${delayBase}">${formatInline(heading[1])}</h3>`;
                }
                return `<div class="slide-body reveal-item" data-delay="${delayBase}">${formatTextContent(block.content)}</div>`;
            }
            case "example":
                return `
                    <div class="slide-example reveal-item" data-delay="${delayBase}">
                        <span class="slide-example-label">Example</span>
                        <p>${formatInline(block.content)}</p>
                    </div>`;
            case "table":
                return `
                    <div class="slide-body reveal-item" data-delay="${delayBase}">
                        ${renderTableHtml(block.header || [], block.rows || [])}
                    </div>`;
            case "group": {
                const g = normalizeGroupBlock(block);
                if (!g.items?.length) {
                    return `<h3 class="slide-subheading reveal-item" data-delay="${delayBase}">${formatInline(g.label.replace(/^###\s+/, ""))}</h3>`;
                }
                return `
                    <div class="slide-block reveal-item" data-delay="${delayBase}">
                        <h3 class="slide-subheading">${formatInline(g.label.replace(/^###\s+/, ""))}</h3>
                        ${g.note ? `<p class="slide-note">${formatInline(g.note)}</p>` : ""}
                        <ul class="slide-list">
                            ${renderListItems(g.items)}
                        </ul>
                    </div>`;
            }
            case "formula": {
                if (block.numerator && block.denominator) {
                    const lhsHtml = block.lhs
                        ? `<span class="formula-lhs">${formatInline(block.lhs)}</span><span class="formula-equals"> = </span>`
                        : "";
                    return `
                        <div class="slide-formula reveal-item" data-delay="${delayBase}">
                            ${lhsHtml}
                            <div class="formula-fraction">
                                <span class="formula-num">${formatInline(block.numerator)}</span>
                                <span class="formula-den">${formatInline(block.denominator)}</span>
                            </div>
                        </div>`;
                }
                const expr = block.expression || block.lhs || "";
                return `<div class="slide-formula reveal-item" data-delay="${delayBase}"><span class="formula-expr">${formatInline(expr)}</span></div>`;
            }
            default:
                return "";
        }
    }

    function renderFigure(image, caption, delay, withReveal = true) {
        if (!image) return "";
        const alt = caption || "Textbook figure";
        const revealClass = withReveal ? " reveal-item" : "";
        const delayAttr = withReveal ? ` data-delay="${delay}"` : "";
        return `
            <figure class="slide-figure${revealClass}"${delayAttr}>
                <div class="slide-figure-frame" role="button" tabindex="0" title="แตะเพื่อขยายรูป" aria-label="ขยายรูป: ${escapeHtml(alt)}">
                    <img src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async">
                </div>
                ${caption ? `<figcaption class="slide-figure-caption">${escapeHtml(caption)}</figcaption>` : ""}
            </figure>`;
    }

    function renderFigureColumn(section, delay, compact = false, pageOpts = {}, pageBlocks = []) {
        const { pageIndex = 0, pageCount = 1 } = pageOpts;

        if (isRapidReviewSection(section)) {
            if (pageBlocks.length > 0) return "";
            return section.image
                ? `<div class="slide-figure-col slide-figure-col--solo reveal-item" data-delay="${delay}">
                    ${renderFigure(section.image, section.imageCaption, delay, false)}
                </div>`
                : "";
        }

        if (isConceptFirstSection(section) && pageCount >= 3) {
            if (pageIndex === 0) return "";
            if (pageIndex === 1 && section.imageSupplement) {
                return `<div class="slide-figure-col reveal-item" data-delay="${delay}">
                    ${renderFigure(
                        section.imageSupplement,
                        section.imageSupplementCaption,
                        delay,
                        false
                    )}
                </div>`;
            }
            if (pageIndex === pageCount - 1 && section.image) {
                return `<div class="slide-figure-col slide-figure-col--solo reveal-item" data-delay="${delay}">
                    ${renderFigure(section.image, section.imageCaption, delay, false)}
                </div>`;
            }
            return "";
        }

        const figures = [];
        const hasPair = section.image && section.imageSupplement;

        if (hasPair && pageCount > 1 && !compact) {
            // อย่า stack FIGURE + TABLE ในคอลัมน์เดียว — แยกตามหน้า
            if (pageIndex === pageCount - 1) {
                figures.push({
                    src: section.imageSupplement,
                    caption: section.imageSupplementCaption,
                });
            } else {
                figures.push({ src: section.image, caption: section.imageCaption });
            }
        } else {
            if (section.image) {
                figures.push({ src: section.image, caption: section.imageCaption });
            }
            if (section.imageSupplement && !compact && !hasPair) {
                figures.push({
                    src: section.imageSupplement,
                    caption: section.imageSupplementCaption,
                });
            } else if (section.imageSupplement && !compact && hasPair && pageCount === 1) {
                figures.push({
                    src: section.imageSupplement,
                    caption: section.imageSupplementCaption,
                });
            }
        }

        if (!figures.length) return "";

        const dual = figures.length > 1;
        const colClass =
            (compact ? " slide-figure-col--compact" : "") + (dual ? " slide-figure-col--dual" : "");
        return `
            <div class="slide-figure-col${colClass} reveal-item" data-delay="${delay}">
                ${figures.map((fig) => renderFigure(fig.src, fig.caption, delay, false)).join("")}
            </div>`;
    }

    function renderContentBox(section, blocksHtml, pageOpts = {}) {
        const { pageIndex = 0, pageCount = 1 } = pageOpts;
        const wideClass = section.wide ? " content-box--wide" : "";
        const reveal = section.reveal || "left";
        const pageTag =
            pageCount > 1
                ? `<span class="slide-page-tag">${pageIndex + 1} / ${pageCount}</span>`
                : "";
        const titleHtml =
            pageIndex === 0
                ? `<h1 class="slide-heading reveal-item" data-delay="0">${escapeHtml(section.title)}${pageTag}</h1>`
                : `<h2 class="slide-continued-heading reveal-item" data-delay="0">${escapeHtml(section.title)}${pageTag}</h2>`;

        return `
            <div class="content-box${wideClass}" data-reveal-panel data-from="${reveal}">
                <p class="slide-section-num reveal-item" data-delay="0">${section.number}</p>
                ${titleHtml}
                <div class="slide-blocks">${blocksHtml}</div>
            </div>`;
    }

    function renderIntro(data) {
        const introFigure = data.introImage
            ? renderFigure(data.introImage, data.introImageCaption, 1)
            : "";
        return `
            <section id="intro" class="slide slide--intro" data-slide-id="intro" aria-label="Intro">
                <div class="intro-scene${introFigure ? " intro-scene--with-figure" : ""}">
                    <p class="intro-eyebrow">${escapeHtml(data.course)}</p>
                    <h1 class="intro-title">Chapter ${data.chapter}<br>${escapeHtml(data.title)}</h1>
                    ${introFigure ? `<div class="intro-figure-wrap">${introFigure}</div>` : ""}
                </div>
            </section>`;
    }

    function renderThankYou(data) {
        return `
            <section id="outro" class="slide slide--outro" data-slide-id="outro" data-section-id="outro" aria-label="Thank you">
                <div class="outro-scene">
                    <p class="intro-eyebrow">${escapeHtml(data.course)} · Chapter ${data.chapter}</p>
                    <h1 class="outro-title">Thank you</h1>
                    <p class="outro-tagline">ขอบคุณที่ติดตามเรียน</p>
                    <a href="index.html" class="btn-primary outro-hub-link">← กลับ Hub</a>
                </div>
            </section>`;
    }

    function renderSectionPage(section, index, blocks, pageIndex, pageCount) {
        const layout = section.layout || LAYOUTS[index % LAYOUTS.length];
        section.reveal = section.reveal || REVEALS[index % REVEALS.length];
        const slideId = pageCount > 1 ? `${section.id}--${pageIndex + 1}` : section.id;
        const blocksHtml = blocks
            .map((block, i) => renderBlock(block, Math.min(i + 1, 3)))
            .join("");
        const pageOpts = { pageIndex, pageCount };
        const attrs = `id="${slideId}" data-slide-id="${slideId}" data-section-id="${section.id}"`;

        if (section.image) {
            const imageSide = layout === "right" ? "left" : "right";
            const isSubPage = pageIndex > 0;
            const contentHtml = renderContentBox(section, blocksHtml, pageOpts);
            const figureHtml = renderFigureColumn(section, 2, isSubPage, pageOpts, blocks);
            const contentFirst = imageSide === "right";
            const subClass = isSubPage ? " slide--split-sub" : "";
            const textOnly = blocks.length > 0 && !figureHtml;
            const figureOnly = blocks.length === 0 && figureHtml;
            const layoutClass = textOnly
                ? " slide--split-text"
                : figureOnly
                  ? " slide--split-figure"
                  : ` slide--image-${imageSide}`;

            return `
            <section ${attrs} class="slide slide--split${layoutClass}${subClass}" aria-label="${escapeHtml(section.title)}">
                <div class="slide-split">
                    ${figureOnly ? figureHtml : contentFirst ? contentHtml + figureHtml : figureHtml + contentHtml}
                </div>
            </section>`;
        }

        return `
            <section ${attrs} class="slide slide--${layout}" aria-label="${escapeHtml(section.title)}">
                ${renderContentBox(section, blocksHtml, pageOpts)}
            </section>`;
    }

    function renderSection(section, index) {
        let blockPages = chunkBlocks(section.blocks, section);
        const conceptPages = planConceptFirstPages(section.blocks, section);
        if (conceptPages) blockPages = conceptPages;
        if (isRapidReviewSection(section) && section.image && blockPages.some((p) => p.length)) {
            blockPages = [...blockPages, []];
        }
        return blockPages
            .map((pageBlocks, pageIndex) =>
                renderSectionPage(section, index, pageBlocks, pageIndex, blockPages.length)
            )
            .join("");
    }

    function renderNav(data) {
        const items = [
            `<button class="nav-btn active" data-target="intro" onclick="scrollToSection('intro')">Intro</button>`,
            ...data.sections.map(
                (s) =>
                    `<button class="nav-btn" data-target="${s.id}" onclick="scrollToSection('${s.id}')">${s.number}</button>`
            ),
            `<button class="nav-btn" data-target="outro" onclick="scrollToSection('outro')">Thanks</button>`,
        ];
        return items.join("");
    }

    async function loadDeck() {
        const params = new URLSearchParams(window.location.search);
        const deckId = params.get("deck") || "ch1";

        const manifestRes = await fetch(`data/manifest.json?v=${DATA_VERSION}`);
        if (!manifestRes.ok) throw new Error("Failed to load manifest");
        const manifest = await manifestRes.json();

        const entry = manifest.decks.find((d) => d.id === deckId);
        if (!entry) throw new Error(`Unknown deck: ${deckId}`);

        const response = await fetch(`data/${entry.file}?v=${DATA_VERSION}`);
        if (!response.ok) throw new Error("Failed to load slide data");
        const data = await response.json();
        data.id = deckId;
        return data;
    }

    function setDeckBodyClass(deckId) {
        const prefix = "deck-";
        document.body.classList.forEach((cls) => {
            if (cls.startsWith(prefix)) document.body.classList.remove(cls);
        });
        if (deckId) document.body.classList.add(`${prefix}${deckId}`);
    }

    async function build() {
        const navMenu = document.getElementById("nav-menu");
        const slidesRoot = document.getElementById("slides-root");
        if (!navMenu || !slidesRoot) return;

        const deckId = new URLSearchParams(window.location.search).get("deck") || "ch1";

        try {
            const data = await loadDeck();
            setDeckBodyClass(data.id || deckId);
            document.title = `${data.course} Ch.${data.chapter} — Web Slide`;

            navMenu.innerHTML = renderNav(data);
            slidesRoot.innerHTML =
                renderIntro(data) +
                data.sections.map(renderSection).join("") +
                renderThankYou(data);

            window.dispatchEvent(new CustomEvent("slides:built"));
        } catch (err) {
            setDeckBodyClass(deckId);
            slidesRoot.innerHTML = `
                <section class="slide slide--center" data-slide-id="error">
                    <div class="content-box">
                        <h1 class="slide-heading">โหลดข้อมูลไม่สำเร็จ</h1>
                        <p class="slide-body">Deck "${escapeHtml(deckId)}" ไม่พบ หรือเปิดผ่าน local server ไม่ได้</p>
                        <a href="index.html" class="btn-primary" style="margin-top:20px">← กลับ Hub</a>
                    </div>
                </section>`;
            console.error(err);
        }
    }

    build();
})();
