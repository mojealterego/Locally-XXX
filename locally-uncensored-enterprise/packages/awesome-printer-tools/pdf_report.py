#!/usr/bin/env python3
"""Offline, reproducible PDF reports from strictly validated JSON. Requires ReportLab 4.4.9 and local Unicode TTF."""
from __future__ import annotations
import json
from datetime import datetime
import os
import re
import sys
from pathlib import Path
from reportlab import rl_config
rl_config.invariant = 1
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT_CANDIDATES = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
)
def verified(obj):
    if not isinstance(obj, dict) or set(obj) != {'title', 'author', 'generatedAt', 'sections'}:
        raise ValueError('Invalid document')
    if not isinstance(obj['generatedAt'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', obj['generatedAt']):
        raise ValueError('Invalid date')
    datetime.strptime(obj['generatedAt'], '%Y-%m-%dT%H:%M:%SZ')
    for key, cap in [('title',256),('author',128)]:
        if not isinstance(obj[key], str) or not 0<len(obj[key])<=cap:
            raise ValueError('Invalid field')
    sections=obj['sections']
    if not isinstance(sections, list) or not 1<=len(sections)<=30:
        raise ValueError('Invalid sections')
    total=0
    for sec in sections:
        if not isinstance(sec,dict) or set(sec)!={'heading','paragraphs'} or not isinstance(sec['heading'],str) or not 0<len(sec['heading'])<=256:
            raise ValueError('Invalid section')
        if not isinstance(sec['paragraphs'],list) or not 1<=len(sec['paragraphs'])<=40:
            raise ValueError('Invalid paragraphs')
        for p in sec['paragraphs']:
            if not isinstance(p,str) or not 0<len(p)<=8192 or '\x00' in p:
                raise ValueError('Invalid paragraph')
            total+=len(p.encode('utf-8'))
        if total>131072:
            raise ValueError('Document too large')
    return obj

def render(data, path):
    font=next((p for p in [os.environ.get('OMEGA_PDF_FONT_PATH'),*FONT_CANDIDATES] if p and Path(p).is_file()),None)
    if font is None:
        raise RuntimeError('No Unicode TTF available: configure OMEGA_PDF_FONT_PATH')
    pdfmetrics.registerFont(TTFont('OmegaUnicode',font))
    c=canvas.Canvas(path,pagesize=A4,invariant=1,pageCompression=1)
    c.setTitle(data['title']);c.setAuthor(data['author']);c.setSubject('OMEGA deterministic local report')
    width,height=A4;left=50;right=50;top=56;bottom=54;y=height-top;page=1
    def newpage():
        nonlocal y,page
        c.showPage();page+=1;y=height-top
    def line(text,size=10,leading=15,margin=0):
        nonlocal y
        for fragment in text.split('\n'):
            fragments=simpleSplit(fragment,'OmegaUnicode',size,width-left-right) or ['']
            for row in fragments:
                if y-leading<bottom:newpage()
                c.setFont('OmegaUnicode',size)
                c.drawString(left,y-leading+3,row)
                y-=leading
        y-=margin
    line(data['title'],16,23,16)
    for sec in data['sections']:
        if y<bottom+56:newpage()
        line(sec['heading'],12,19,7)
        for paragraph in sec['paragraphs']:
            line(paragraph,10,15,8)
    if y<bottom+20:newpage()
    line(data['author']+' · '+data['generatedAt'],8,13)
    c.showPage();c.save()

if __name__=='__main__':
    try:
        if len(sys.argv)!=3:raise ValueError('Expected input JSON path and output PDF path')
        src,dst=map(Path,sys.argv[1:]);raw=src.read_bytes()
        if len(raw)>145000:raise ValueError('Oversized input')
        data=verified(json.loads(raw.decode('utf-8')))
        with dst.open('xb') as output:
            try:
                render(data,output)
            except Exception:
                dst.unlink(missing_ok=True)
                raise
    except Exception as exc:
        sys.stderr.write('Report export failed: '+str(exc)+'\n');sys.exit(1)
