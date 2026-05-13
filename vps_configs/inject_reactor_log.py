#!/usr/bin/env python3
"""
Inject bandwidth_reactor.lua as log_by_lua_file into all intercept configs.
log_by_lua runs AFTER response is sent — zero impact on latency.
It feeds the L1 ring buffer that decision_engine.lua reads.
"""

LOG_HOOK = '        log_by_lua_file /etc/nginx/lua/bandwidth_reactor.lua;'

files = [
    "/etc/nginx/conf.d/iptv-intercept.conf",
    "/etc/nginx/conf.d/rynivorn-intercept.conf",
    "/etc/nginx/conf.d/zivovrix-intercept.conf",
    "/etc/nginx/conf.d/autopista-trap.conf",
]

for path in files:
    try:
        with open(path, "r") as f:
            content = f.read()

        if "bandwidth_reactor.lua" in content:
            print(f"SKIP {path} — already has bandwidth_reactor")
            continue

        # Add log_by_lua after every floor_lock_filter line
        content = content.replace(
            "body_filter_by_lua_file /etc/nginx/lua/floor_lock_filter.lua;",
            "body_filter_by_lua_file /etc/nginx/lua/floor_lock_filter.lua;\n" + LOG_HOOK
        )

        with open(path, "w") as f:
            f.write(content)

        count = content.count("bandwidth_reactor.lua")
        print(f"OK {path} — injected {count} log_by_lua hooks")

    except Exception as e:
        print(f"ERROR {path}: {e}")
