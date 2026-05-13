---
description: How to safely deploy the OMEGA UI Frontend from Local Dev to the VPS Production branch
---

# Deploy OMEGA UI to Production (VPS)

Use this workflow whenever the USER asks to push the latest UI changes from their local development environment to the live production server.

1. Create a compressed zip payload of the local frontend source code. This compresses the transmission time avoiding thousands of tiny files over SCP.
// turbo
2. Transmit and deploy via SSH.
```powershell
Compress-Archive -Path "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\frontend\*" -DestinationPath "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\UI_TEMP.zip" -Force
scp -o StrictHostKeyChecking=no "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\UI_TEMP.zip" root@178.156.147.234:/var/www/html/OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH/
ssh -o StrictHostKeyChecking=no root@178.156.147.234 "cd /var/www/html/OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH && unzip -o UI_TEMP.zip && rm UI_TEMP.zip && chown -R www-data:www-data ."
Remove-Item -Path "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\UI_TEMP.zip" -Force
```

3. Provide the user with the Production URL to verify the changes:
`https://iptv-ape.duckdns.org/OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH/index-v4.html`
