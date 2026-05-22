import subprocess

# Single string for Windows CMD execution with shell=True
cmd_str = 'adb -s 192.168.10.28:5555 shell "printf \\"GET / HTTP/1.1\\\\r\\\\nHost: google.com\\\\r\\\\nConnection: close\\\\r\\\\n\\\\r\\\\n\\" | nc google.com 80"'

print("Running:", cmd_str)
p = subprocess.Popen(cmd_str, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True, text=True)
try:
    stdout, stderr = p.communicate(timeout=5)
    print("--- STDOUT ---")
    print(repr(stdout))
    print("--- STDERR ---")
    print(repr(stderr))
    print("EXIT CODE:", p.returncode)
except subprocess.TimeoutExpired:
    p.kill()
    stdout, stderr = p.communicate()
    print("TIMEOUT EXPIRED")
    print("--- STDOUT SO FAR ---")
    print(repr(stdout))
    print("--- STDERR SO FAR ---")
    print(repr(stderr))
