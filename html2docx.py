#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convert HWO完整方案v2.0.html into a structured Word document."""

import re
from bs4 import BeautifulSoup, NavigableString, Tag
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


SRC = "/workspace/HWO完整方案v2.0.html"
DST = "/workspace/HWO完整方案v2.0.docx"


# ---------- helpers ----------

def set_cell_bg(cell, hex_color):
    """Set table cell background color (hex without #)."""
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tc_pr.append(shd)


def add_runs_from_node(paragraph, node, inherited_bold=False, inherited_italic=False):
    """Recursively walk inline children, adding runs with proper styling.

    Handles <strong>/<b>, <em>/<i>, <code>, <span class="done|missing|partial|tag-*">.
    """
    if node is None:
        return
    for child in node.children:
        if isinstance(child, NavigableString):
            text = str(child)
            if text and not text.isspace():
                run = paragraph.add_run(text)
                run.bold = inherited_bold
                run.italic = inherited_italic
                run.font.size = Pt(10.5)
        elif isinstance(child, Tag):
            name = child.name.lower()
            if name in ('strong', 'b'):
                add_runs_from_node(paragraph, child, True, inherited_italic)
            elif name in ('em', 'i'):
                add_runs_from_node(paragraph, child, inherited_bold, True)
            elif name == 'code':
                run = paragraph.add_run(child.get_text())
                run.font.name = 'Consolas'
                run.font.size = Pt(10)
                r = run._element
                rPr = r.get_or_add_rPr()
                rFonts = OxmlElement('w:rFonts')
                rFonts.set(qn('w:ascii'), 'Consolas')
                rFonts.set(qn('w:hAnsi'), 'Consolas')
                rPr.append(rFonts)
                shd = OxmlElement('w:shd')
                shd.set(qn('w:val'), 'clear')
                shd.set(qn('w:color'), 'auto')
                shd.set(qn('w:fill'), 'F0F0F0')
                rPr.append(shd)
            elif name == 'br':
                paragraph.add_run().add_break()
            elif name == 'a':
                add_runs_from_node(paragraph, child, inherited_bold, inherited_italic)
            elif name == 'span':
                cls = child.get('class', []) or []
                color = None
                if 'done' in cls:
                    color = RGBColor(0x27, 0xae, 0x60)
                elif 'missing' in cls:
                    color = RGBColor(0xc8, 0x10, 0x2e)
                elif 'partial' in cls:
                    color = RGBColor(0xe6, 0x7e, 0x22)
                elif 'tag-red' in cls:
                    color = RGBColor(0xc8, 0x10, 0x2e)
                elif 'tag-green' in cls:
                    color = RGBColor(0x27, 0xae, 0x60)
                elif 'tag-blue' in cls:
                    color = RGBColor(0x29, 0x80, 0xb9)
                elif 'tag-orange' in cls:
                    color = RGBColor(0xe6, 0x7e, 0x22)
                elif 'tag-gray' in cls:
                    color = RGBColor(0x66, 0x66, 0x66)
                # Recurse into span children first, then color the LAST run
                before_count = len(paragraph.runs)
                add_runs_from_node(paragraph, child, inherited_bold, inherited_italic)
                if color is not None:
                    for run in paragraph.runs[before_count:]:
                        run.font.color.rgb = color
                        run.bold = True
            else:
                # fallback: just take text
                add_runs_from_node(paragraph, child, inherited_bold, inherited_italic)


def style_heading(p, level, text, color=None):
    p.style = f'Heading {level}'
    run = p.add_run(text)
    if color:
        run.font.color.rgb = color


def add_table_from_html(doc, table_tag):
    rows = table_tag.find_all('tr')
    if not rows:
        return
    # Determine column count from max cells in any row
    max_cols = max(
        len(row.find_all(['th', 'td'], recursive=False))
        for row in rows
    )
    table = doc.add_table(rows=len(rows), cols=max_cols)
    table.style = 'Light Grid Accent 1'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for ri, row in enumerate(rows):
        cells = row.find_all(['th', 'td'], recursive=False)
        for ci in range(max_cols):
            cell = table.cell(ri, ci)
            if ci < len(cells):
                cell_text = cells[ci]
                is_header = cell_text.name == 'th'
                # clear default paragraph
                para = cell.paragraphs[0]
                para.text = ''
                add_runs_from_node(para, cell_text)
                if is_header:
                    set_cell_bg(cell, 'F5F5F5')
                    for run in para.runs:
                        run.bold = True
            else:
                # merge missing cells (colspan not handled, just empty)
                cell.text = ''


# ---------- main ----------

def main():
    with open(SRC, encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')
    body = soup.body or soup

    doc = Document()
    # default font
    style = doc.styles['Normal']
    style.font.name = 'Microsoft YaHei'
    style.font.size = Pt(10.5)
    # set CJK font
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    rfonts.set(qn('w:eastAsia'), 'Microsoft YaHei')

    # page margins
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)

    H1_COLOR = RGBColor(0xc8, 0x10, 0x2e)
    H2_COLOR = RGBColor(0xc8, 0x10, 0x2e)

    # iterate top-level body children in order
    skip_container = False
    for el in body.children:
        if isinstance(el, NavigableString):
            text = str(el).strip()
            if text:
                p = doc.add_paragraph(text)
        elif isinstance(el, Tag):
            name = el.name.lower()
            if name in ('h1',):
                style_heading(doc.add_paragraph(), 1, el.get_text(), H1_COLOR)
            elif name == 'h2':
                style_heading(doc.add_paragraph(), 2, el.get_text(), H2_COLOR)
            elif name == 'h3':
                style_heading(doc.add_paragraph(), 3, el.get_text())
            elif name == 'h4':
                style_heading(doc.add_paragraph(), 4, el.get_text())
            elif name == 'p':
                p = doc.add_paragraph()
                add_runs_from_node(p, el)
            elif name == 'blockquote':
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Inches(0.3)
                p.paragraph_format.left_indent = Pt(20)
                # light shading via paragraph border (simple: italic + indent)
                add_runs_from_node(p, el, inherited_italic=False)
                # add left border
                pPr = p._p.get_or_add_pPr()
                pbdr = OxmlElement('w:pBdr')
                left = OxmlElement('w:left')
                left.set(qn('w:val'), 'single')
                left.set(qn('w:sz'), '24')
                left.set(qn('w:space'), '8')
                left.set(qn('w:color'), 'C8102E')
                pbdr.append(left)
                pPr.append(pbdr)
                # shading
                shd = OxmlElement('w:shd')
                shd.set(qn('w:val'), 'clear')
                shd.set(qn('w:color'), 'auto')
                shd.set(qn('w:fill'), 'FFF5F5')
                pPr.append(shd)
            elif name == 'pre':
                # code block: monospace, light bg
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Pt(8)
                code_text = el.get_text()
                run = p.add_run(code_text)
                run.font.name = 'Consolas'
                run.font.size = Pt(9)
                r = run._element
                rPr = r.get_or_add_rPr()
                rFonts = OxmlElement('w:rFonts')
                rFonts.set(qn('w:ascii'), 'Consolas')
                rFonts.set(qn('w:hAnsi'), 'Consolas')
                rPr.append(rFonts)
                # paragraph shading
                pPr = p._p.get_or_add_pPr()
                shd = OxmlElement('w:shd')
                shd.set(qn('w:val'), 'clear')
                shd.set(qn('w:color'), 'auto')
                shd.set(qn('w:fill'), '282C34')
                pPr.append(shd)
                # white text
                run.font.color.rgb = RGBColor(0xab, 0xb2, 0xbf)
            elif name == 'ul':
                for li in el.find_all('li', recursive=False):
                    p = doc.add_paragraph(style='List Bullet')
                    add_runs_from_node(p, li)
            elif name == 'ol':
                for li in el.find_all('li', recursive=False):
                    p = doc.add_paragraph(style='List Number')
                    add_runs_from_node(p, li)
            elif name == 'table':
                add_table_from_html(doc, el)
                # add small spacing paragraph after table
                doc.add_paragraph()
            elif name == 'hr':
                p = doc.add_paragraph()
                pPr = p._p.get_or_add_pPr()
                pbdr = OxmlElement('w:pBdr')
                bottom = OxmlElement('w:bottom')
                bottom.set(qn('w:val'), 'single')
                bottom.set(qn('w:sz'), '6')
                bottom.set(qn('w:space'), '1')
                bottom.set(qn('w:color'), 'CCCCCC')
                pbdr.append(bottom)
                pPr.append(pbdr)
            elif name == 'div':
                # handle toc / alert divs: render inner content
                cls = el.get('class', []) or []
                if 'toc' in cls:
                    # render as plain paragraphs with bold title
                    p = doc.add_paragraph()
                    add_runs_from_node(p, el)
                elif 'alert' in cls or 'roadmap-step' in cls:
                    p = doc.add_paragraph()
                    pPr = p._p.get_or_add_pPr()
                    shd = OxmlElement('w:shd')
                    shd.set(qn('w:val'), 'clear')
                    shd.set(qn('w:color'), 'auto')
                    if 'alert-red' in cls:
                        shd.set(qn('w:fill'), 'F8D7DA')
                    elif 'alert-green' in cls:
                        shd.set(qn('w:fill'), 'D4EDDA')
                    else:
                        shd.set(qn('w:fill'), 'FFF3CD')
                    pPr.append(shd)
                    pPr_bdr = OxmlElement('w:pBdr')
                    for side in ('top', 'left', 'bottom', 'right'):
                        b = OxmlElement(f'w:{side}')
                        b.set(qn('w:val'), 'single')
                        b.set(qn('w:sz'), '8')
                        b.set(qn('w:space'), '4')
                        b.set(qn('w:color'), 'CCCCCC')
                        pPr_bdr.append(b)
                    pPr.append(pPr_bdr)
                    p.paragraph_format.left_indent = Pt(6)
                    add_runs_from_node(p, el)
                else:
                    # generic div - render inner
                    p = doc.add_paragraph()
                    add_runs_from_node(p, el)
            else:
                # fallback: render text
                p = doc.add_paragraph()
                add_runs_from_node(p, el)

    doc.save(DST)
    print(f"Saved: {DST}")


if __name__ == '__main__':
    main()
