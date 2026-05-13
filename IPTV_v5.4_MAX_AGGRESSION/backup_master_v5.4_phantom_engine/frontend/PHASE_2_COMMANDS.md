# Phase 2: Configuration - Quick Command Reference

**Status**: Ready to Execute  
**Prerequisites**: Phase 1 Complete ✅  
**Estimated Time**: 5-10 minutes

---

## Step 1: Install/Verify Wrangler CLI

```powershell
# Check current version
wrangler --version

# If needed, install/update globally
npm install -g wrangler@latest

# Verify installation
wrangler --version
```

**Expected**: `wrangler 3.x.x` or higher

---

## Step 2: Authenticate with Cloudflare

```powershell
# Login (opens browser for OAuth)
wrangler login

# After login, verify
wrangler whoami
```

**Expected Output Example**:

```
👋 You are logged in with an OAuth token.
╭──────────────────────────────────────────────────────────╮
│ Account Name: Your Account Name                          │
│ Account ID:   1234567890abcdef1234567890abcdef           │
╰──────────────────────────────────────────────────────────╯
```

**🔴 ACTION REQUIRED**: Copy your **Account ID** from the output above.

---

## Step 3: Update wrangler.toml

**File**: `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO\iptv_nav\files\cf_worker\wrangler.toml`

**Line 14**: Replace with your Account ID

```toml
account_id = "YOUR_ACCOUNT_ID_HERE"  # ← Paste the ID from Step 2
```

---

## Step 4: Verify R2 Bucket

```powershell
# List all R2 buckets
wrangler r2 bucket list
```

**Expected**: Should show `apelistv2` in the list.

**If NOT present**, create it:

```powershell
wrangler r2 bucket create apelistv2
```

---

## Step 5: Review Configuration

```powershell
# Navigate to worker directory
cd C:\Users\HFRC\Desktop\IPTV_Navigator_PRO\iptv_nav\files\cf_worker

# Verify configuration
cat wrangler.toml
```

**Verify**:

- ✅ `account_id` is filled
- ✅ `bucket_name = "apelistv2"`
- ✅ `main = "src/index.js"`
- ✅ `binding = "CHANNELS_R2"`

---

## Optional: Update JWT Secret (Production Security)

**File**: `cf_worker/src/index.js`  
**Line 18**: Change the placeholder secret

```javascript
// Generate a random 32-char secret
// Using PowerShell:
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | %{[char]$_})

// Then update:
JWT_SECRET: 'YOUR_GENERATED_SECRET_HERE',
```

---

## Configuration Checklist

Before proceeding to Phase 3:

- [ ] Wrangler CLI installed (v3.x+)
- [ ] Authenticated with Cloudflare (`wrangler whoami` works)
- [ ] Account ID copied and saved
- [ ] `wrangler.toml` updated with Account ID
- [ ] R2 bucket `apelistv2` verified/created
- [ ] Optional: JWT secret updated

---

## Next Phase

Once all checks pass, proceed to **Phase 3: R2 Upload** to upload your M3U8 playlist to Cloudflare R2 storage.

---

## Troubleshooting

### Issue: "wrangler: command not found"

**Windows PowerShell**:

```powershell
npm install -g wrangler@latest
refreshenv  # Or restart PowerShell
```

### Issue: "Login failed"

1. Check internet connection
2. Try: `wrangler logout` then `wrangler login`
3. Ensure browser allows pop-ups

### Issue: "Account ID not found"

Make sure to run `wrangler whoami` after successful login. The Account ID is in the output.

---

**Ready to proceed?** Run the commands above and confirm all checkboxes are ✅
