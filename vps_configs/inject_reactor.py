import re

path = "/etc/nginx/conf.d/autopista-trap.conf"
with open(path, "r") as f:
    content = f.read()

# Lua hooks to inject into EVERY location block
lua_hooks = """
        # ═══ MODULE 6: REACTOR — Lua Pipeline (ALL 4 hooks) ═══
        rewrite_by_lua_file /etc/nginx/lua/decision_engine.lua;
        access_by_lua_file /etc/nginx/lua/upstream_gate.lua;
        header_filter_by_lua_file /etc/nginx/lua/upstream_response.lua;
        body_filter_by_lua_file /etc/nginx/lua/floor_lock_filter.lua;
"""

# For each location block, inject Lua hooks right after the proxy_pass line
# Find each "proxy_pass http://$host;" and add hooks after it
content = content.replace(
    '        proxy_pass http://$host;',
    '        proxy_pass http://$host;\n' + lua_hooks,
    3  # Replace in all 3 location blocks
)

with open(path, "w") as f:
    f.write(content)

print("REACTOR hooks injected into all 3 TRAP locations")
