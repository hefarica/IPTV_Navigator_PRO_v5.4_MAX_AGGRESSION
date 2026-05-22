#!/system/bin/sh
printf "GET / HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n" | nc 192.168.10.29 7777 2>&1
echo "EXIT_CODE: $?"
