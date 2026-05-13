with open('/opt/netshield/ape-sentinel-vps.sh','r') as f:
    c = f.read()
old1 = 'curl -s --interface "$WG_MIAMI_IP"'
new1 = 'curl -s --interface wg-surfshark'
old2 = 'curl -s --interface "$WG_BRAZIL_IP"'
new2 = 'curl -s --interface wg-surfshark-br'
c = c.replace(old1, new1).replace(old2, new2)
with open('/opt/netshield/ape-sentinel-vps.sh','w') as f:
    f.write(c)
print('SENTINEL FIXED')
