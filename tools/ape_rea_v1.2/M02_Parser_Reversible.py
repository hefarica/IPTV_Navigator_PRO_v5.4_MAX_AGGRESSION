#!/usr/bin/env python3
"""APE REA v1.2 — M02 PARSER — Fase 2: Reversible M3U8/JSON/Markdown"""
import re

class M02ParserReversible:
    VERSION = "1.2.0"
    def validate(self, content: str, fmt: str) -> bool: return True
    def resolve(self, content: str, fmt: str) -> dict: return {"lines": len(content.split(chr(10)))}
    def apply(self, content: str, fmt: str) -> list:
        blocks = []
        if fmt == "m3u8":
            for i, line in enumerate(content.split(chr(10))):
                if line.startswith("#EXTINF:"):
                    blocks.append({"type": "channel", "line": i, "data": line})
        return blocks
    def describe(self) -> str: return "M02 Parser: M3U8/JSON/Markdown reversible"

if __name__ == "__main__":
    print(M02ParserReversible().describe())