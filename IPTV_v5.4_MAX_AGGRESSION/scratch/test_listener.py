import socket

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('0.0.0.0', 7777))
s.listen(1)
print("Listening on port 7777...")
try:
    conn, addr = s.accept()
    print("Connected by", addr)
    data = conn.recv(1024)
    print("Received data:")
    print(repr(data))
    conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nTEST")
    conn.close()
finally:
    s.close()
