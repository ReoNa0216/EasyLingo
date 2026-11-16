from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak

root = Path(__file__).resolve().parents[1]
pdfmetrics.registerFont(TTFont('CN', 'C:/Windows/Fonts/msyh.ttc'))
pdfmetrics.registerFont(TTFont('CN-Bold', 'C:/Windows/Fonts/msyhbd.ttc'))
pdfmetrics.registerFontFamily('CN', normal='CN', bold='CN-Bold', italic='CN', boldItalic='CN-Bold')
ink = colors.HexColor('#2F243B')
purple = colors.HexColor('#5F479A')
body = ParagraphStyle('body', fontName='CN', fontSize=10.2, leading=17, textColor=ink, spaceAfter=10, wordWrap='CJK')
small = ParagraphStyle('small', parent=body, fontSize=8.5, leading=13, textColor=colors.HexColor('#786B86'), spaceAfter=7)
title = ParagraphStyle('title', parent=body, fontName='CN-Bold', fontSize=25, leading=34, textColor=purple, spaceAfter=12)
h2 = ParagraphStyle('h2', parent=body, fontName='CN-Bold', fontSize=17, leading=25, textColor=purple, spaceBefore=7, spaceAfter=13)
h3 = ParagraphStyle('h3', parent=body, fontName='CN-Bold', fontSize=12, leading=20, textColor=purple, spaceBefore=9, spaceAfter=8)

def markup(t):
    t = escape(t)
    t = re.sub(r'\[([^\]]+)\]\((https?://[^\s)]+)\)', r'<link href="\2" color="#5F479A"><u>\1</u></link>', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'`([^`]+)`', r'<font color="#5F479A">\1</font>', t)
    return t

story = []
for block in (root/'docs/api-configuration.md').read_text(encoding='utf-8').split('\n\n'):
    block = block.strip()
    if not block: continue
    if block.startswith('## '):
        if not block.startswith('## 01'): story.append(PageBreak())
        story.append(Paragraph(markup(block[3:]), h2))
    elif block.startswith('### '): story.append(Paragraph(markup(block[4:]), h3))
    elif block.startswith('# '): story.append(Paragraph(markup(block[2:]), title))
    elif block.startswith('!['):
        path = root/'docs'/re.search(r'\]\(([^)]+)\)', block).group(1)
        pic = Image(str(path), width=270, height=270*1776/1024)
        pic.hAlign='CENTER'
        story.extend([Spacer(1,3), pic, Spacer(1,10)])
    else:
        is_small = block.startswith(('适用版本', '开发者', '图中', '官方参考', '项目与下载'))
        story.append(Paragraph(markup(block.replace('\n',' ')), small if is_small else body))

def page_frame(c, doc):
    c.setStrokeColor(colors.HexColor('#E7E0F0')); c.setLineWidth(0.6)
    c.line(44,42,A4[0]-44,42)
    c.setFont('CN',8); c.setFillColor(colors.HexColor('#786B86'))
    c.drawString(44,27,'EasyLingo 2.1.0  /  API 配置指南')
    c.drawRightString(A4[0]-44,27,str(doc.page))

doc = SimpleDocTemplate(str(root/'API_configuration.pdf'), pagesize=A4, rightMargin=44,leftMargin=44,topMargin=36,bottomMargin=55,
    title='EasyLingo 2.1.0 API 配置指南', author='陈挚 / 清华大学语言教学中心')
doc.build(story,onFirstPage=page_frame,onLaterPages=page_frame)
print('Created',root/'API_configuration.pdf')
