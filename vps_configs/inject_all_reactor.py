#!/usr/bin/env python3
"""
Inject MODULE 6 REACTOR Lua hooks into all 3 intercept configs.
Adds 4 hooks after every proxy_pass line that doesn't already have them.
"""
import re

LUA_HOOKS = """
        # ═══ MODULE 6: REACTOR — Lua Pipeline ═══
        rewrite_by_lua_file /etc/nginx/lua/decision_engine.lua;
        access_by_lua_file /etc/nginx/lua/upstream_gate.lua;
        header_filter_by_lua_file /etc/nginx/lua/upstream_response.lua;
        body_filter_by_lua_file /etc/nginx/lua/floor_lock_filter.lua;"""

files = [
    "/etc/nginx/conf.d/iptv-intercept.conf",
    "/etc/nginx/conf.d/rynivorn-intercept.conf",
    "/etc/nginx/conf.d/zivovrix-intercept.conf",
]

for path in files:
    try:
        with open(path, "r") as f:
            content = f.read()

        # Skip if already has lua hooks
        if "decision_engine.lua" in content:
            print(f"SKIP {path} — already has REACTOR hooks")
            continue

        # Find all proxy_pass lines and inject hooks after each one
        lines = content.split("\n")
        new_lines = []
        injected = 0
        in_upstream = False

        for line in lines:
            new_lines.append(line)
            stripped = line.strip()

            # Skip upstream blocks (proxy_pass not in location context)
            if stripped.startswith("upstream "):
                in_upstream = True
            if in_upstream and stripped == "}":
                in_upstream = False
                continue
            if in_upstream:
                continue

            # Inject after proxy_pass lines inside location blocks
            if stripped.startswith("proxy_pass ") and "http" in stripped:
                new_lines.append(LUA_HOOKS)
                injected += 1

        result = "\n".join(new_lines)

        with open(path, "w") as f:
            f.write(result)

        print(f"OK {path} — injected {injected} hook blocks")

    except Exception as e:
        print(f"ERROR {path}: {e}")
