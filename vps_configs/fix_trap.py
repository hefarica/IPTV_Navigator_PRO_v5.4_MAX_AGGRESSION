import re
path = "/etc/nginx/conf.d/autopista-trap.conf"
with open(path, "r") as f:
    content = f.read()
# Replace all server_name lines with proper NGINX regex syntax
content = re.sub(
    r'server_name\s+[^;]+;',
    'server_name "~^[0-9]+[.][0-9]+[.][0-9]+[.][0-9]+$";',
    content
)
with open(path, "w") as f:
    f.write(content)
print("FIXED server_name in autopista-trap.conf")
