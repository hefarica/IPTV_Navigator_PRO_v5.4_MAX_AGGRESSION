/**
 * APE Quality Manifest API — Local ADB Bridge
 * Runs on the user's PC to bridge frontend requests to ONN via local ADB.
 * 
 * Usage: node quality-manifest-local-api.js
 * Listens on: http://localhost:7777
 */
const http = require('http');
const { execSync } = require('child_process');
const url = require('url');

const PORT = 7777;
const ONN = '192.168.10.28:5555';
const GUARDIAN_PATH = '/data/local/tmp/ape-ram-guardian.sh';
const GUARDIAN_LOCK = '/data/local/tmp/ape-ram-guardian.lock';

function adb(cmd, timeout = 8000) {
  try {
    return execSync(`adb -s ${ONN} shell "${cmd.replace(/"/g, '\\"')}"`, { timeout, encoding: 'utf-8' }).trim();
  } catch (e) { return null; }
}

function adbConnect() {
  try {
    const check = execSync(`adb -s ${ONN} shell "echo OK"`, { timeout: 3000, encoding: 'utf-8' }).trim();
    if (check === 'OK') return true;
  } catch (_) {}
  try { execSync(`adb connect ${ONN}`, { timeout: 5000, encoding: 'utf-8' }); } catch (_) {}
  try {
    const check = execSync(`adb -s ${ONN} shell "echo OK"`, { timeout: 3000, encoding: 'utf-8' }).trim();
    return check === 'OK';
  } catch (_) { return false; }
}

// Settings manifest
const MANIFEST = [
  ['system','aipq_enable','1','ai','AI PQ Enable','toggle',null],
  ['system','aisr_enable','1','ai','AI SR Enable','toggle',null],
  ['system','ai_pq_mode','3','ai','AI PQ Mode','select',{'0':'Off','1':'Low','2':'Mid','3':'High'}],
  ['system','ai_sr_mode','3','ai','AI SR Mode','select',{'0':'Off','1':'Low','2':'Mid','3':'High'}],
  ['global','ai_pic_mode','3','ai','AI Picture Mode','select',{'0':'Off','1':'Low','2':'Mid','3':'High'}],
  ['global','ai_sr_level','3','ai','AI SR Level','select',{'0':'Off','1':'Low','2':'Mid','3':'High'}],
  ['global','pq_ai_dnr_enable','1','ai','AI Digital NR','toggle',null],
  ['global','pq_ai_fbc_enable','1','ai','AI Film Bias Comp','toggle',null],
  ['global','pq_ai_sr_enable','1','ai','AI SR Global','toggle',null],
  ['global','pq_nr_enable','1','ai','Noise Reduction','toggle',null],
  ['global','pq_sharpness_enable','1','ai','Sharpness','toggle',null],
  ['global','pq_dnr_enable','1','ai','Digital NR','toggle',null],
  ['global','smart_illuminate_enabled','1','ai','Smart Illuminate','toggle',null],
  ['global','user_preferred_resolution_height','2160','display','Resolution Height','readonly',null],
  ['global','user_preferred_resolution_width','3840','display','Resolution Width','readonly',null],
  ['global','user_preferred_refresh_rate','60.0','display','Refresh Rate','select',{'23.976':'23.976','24.0':'24','29.97':'29.97','30.0':'30','50.0':'50','59.94':'59.94','60.0':'60'}],
  ['global','display_color_mode','3','display','Color Mode','select',{'0':'Native','1':'Boosted','2':'Saturated','3':'HDR'}],
  ['global','match_content_frame_rate_pref','2','display','Match Frame Rate','select',{'0':'Never','1':'Non-Seamless','2':'Seamless'}],
  ['global','match_content_frame_rate','1','display','Frame Match ON','toggle',null],
  ['global','hdr_conversion_mode','0','hdr','HDR Conversion','select',{'0':'Passthrough','1':'System','2':'SDR','3':'Force'}],
  ['global','hdr_output_type','4','hdr','HDR Output Type','select',{'0':'None','1':'HDR10','2':'HLG','3':'DolbyVision','4':'Auto-Best'}],
  ['global','hdr_force_conversion_type','-1','hdr','Force Conversion','select',{'-1':'Disabled','1':'HDR10','2':'HLG','3':'DolbyVision'}],
  ['global','hdr_brightness_boost','100','hdr','HDR Brightness','number',{min:0,max:100}],
  ['global','sdr_brightness_in_hdr','100','hdr','SDR in HDR Bright','number',{min:0,max:100}],
  ['global','peak_luminance','8000','hdr','Peak Luminance','number',{min:100,max:10000}],
  ['global','pq_hdr_enable','1','hdr','HDR Engine','toggle',null],
  ['global','pq_hdr_mode','1','hdr','HDR Processing','toggle',null],
  ['global','always_hdr','0','hdr','Always HDR','toggle',null],
  ['global','hdmi_color_space','2','color','HDMI Color Space','select',{'0':'RGB','1':'YCbCr 4:4:4','2':'YCbCr 4:2:2','3':'YCbCr 4:2:0'}],
  ['global','color_depth','12','color','Color Depth','select',{'8':'8-bit','10':'10-bit','12':'12-bit'}],
  ['global','color_mode_ycbcr422','1','color','YCbCr 4:2:2','toggle',null],
  ['global','encoded_surround_output','2','audio','Surround Output','select',{'0':'Never','1':'Auto','2':'Always'}],
  ['global','enable_dolby_atmos','1','audio','Dolby Atmos','toggle',null],
  ['global','db_id_sound_spdif_output_enable','1','audio','SPDIF Output','toggle',null],
  ['global','video_brightness','100','brightness','Video Brightness','number',{min:0,max:100}],
  ['system','screen_brightness','255','brightness','Screen Brightness','number',{min:0,max:255}],
  ['global','force_gpu_rendering','1','gpu','Force GPU','toggle',null],
  ['global','force_hw_ui','1','gpu','Force HW UI','toggle',null],
  ['global','hardware_accelerated_rendering_enabled','1','gpu','HW Accel','toggle',null],
  ['system','screen_off_timeout','2147483647','power','Screen Timeout','select',{'60000':'1min','300000':'5min','1800000':'30min','2147483647':'Never'}],
];

function handleRequest(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed = url.parse(req.url, true);
  const action = parsed.query.action || '';

  if (!adbConnect()) {
    res.end(JSON.stringify({ ok: false, error: 'ADB unreachable', device: ONN }));
    return;
  }

  switch (action) {
    case 'read_all': {
      const results = [];
      const groups = {};
      for (const [ns, key, expected, group, label, type, options] of MANIFEST) {
        const current = adb(`settings get ${ns} ${key}`);
        const cv = (current === '' || current === 'null') ? null : current;
        const synced = cv === expected;
        results.push({ ns, key, current: cv, expected, synced, group, label, type, options });
        if (!groups[group]) groups[group] = 0;
        if (!synced) groups[group]++;
      }
      const pid = adb(`cat ${GUARDIAN_LOCK}`);
      let alive = false;
      if (pid && /^\d+$/.test(pid.trim())) {
        const check = adb(`kill -0 ${pid.trim()} 2>/dev/null && echo YES || echo NO`);
        alive = check === 'YES';
      }
      res.end(JSON.stringify({
        ok: true, settings: results, drift_by_group: groups,
        guardian: { pid: pid || null, alive },
        total: MANIFEST.length, ts: new Date().toISOString()
      }));
      break;
    }

    case 'guardian_status': {
      const pid = adb(`cat ${GUARDIAN_LOCK}`);
      let alive = false;
      if (pid && /^\d+$/.test(pid.trim())) {
        const check = adb(`kill -0 ${pid.trim()} 2>/dev/null && echo YES || echo NO`);
        alive = check === 'YES';
      }
      const log = adb('tail -5 /data/local/tmp/ape-ram-guardian.log');
      res.end(JSON.stringify({ ok: true, pid: pid || null, alive, log }));
      break;
    }

    case 'set': {
      const key = parsed.query.key || '';
      const value = parsed.query.value || '';
      const ns = parsed.query.ns || 'global';
      if (!key || value === '') {
        res.end(JSON.stringify({ ok: false, error: 'Missing key or value' }));
        return;
      }
      // 1. Ensure guardian alive
      const pid = adb(`cat ${GUARDIAN_LOCK}`)?.trim();
      if (!pid || !/^\d+$/.test(pid)) {
        adb(`rm -f ${GUARDIAN_LOCK} && chmod 755 ${GUARDIAN_PATH} && nohup ${GUARDIAN_PATH} daemon > /dev/null 2>&1 &`);
        execSync('timeout /t 3 /nobreak', { encoding: 'utf-8', windowsHide: true }).catch(() => {});
      }
      // 2. Apply
      adb(`settings put ${ns} ${key} ${value}`);
      // 3. Verify
      const readback = adb(`settings get ${ns} ${key}`);
      const applied = readback?.trim() === value.trim();
      // 4. Wait and check for hardware rejection
      execSync('ping -n 3 127.0.0.1 > nul', { windowsHide: true, encoding: 'utf-8' });
      const final_ = adb(`settings get ${ns} ${key}`);
      const hw_rejected = final_?.trim() !== value.trim();
      // 5. Guardian still alive
      const pid2 = adb(`cat ${GUARDIAN_LOCK}`)?.trim();
      let still_alive = false;
      if (pid2 && /^\d+$/.test(pid2)) {
        still_alive = adb(`kill -0 ${pid2} 2>/dev/null && echo YES || echo NO`) === 'YES';
      }
      res.end(JSON.stringify({
        ok: applied, key, value, readback: readback?.trim(),
        final: final_?.trim(), hw_rejected,
        guardian_pid: pid2, guardian_alive: still_alive
      }));
      break;
    }

    case 'restart_guardian': {
      const pid = adb(`cat ${GUARDIAN_LOCK}`)?.trim();
      if (pid && /^\d+$/.test(pid)) adb(`kill ${pid}`);
      adb(`rm -f ${GUARDIAN_LOCK} && chmod 755 ${GUARDIAN_PATH} && nohup ${GUARDIAN_PATH} daemon > /dev/null 2>&1 &`);
      execSync('ping -n 6 127.0.0.1 > nul', { windowsHide: true, encoding: 'utf-8' });
      const newpid = adb(`cat ${GUARDIAN_LOCK}`)?.trim();
      let alive = false;
      if (newpid && /^\d+$/.test(newpid)) {
        alive = adb(`kill -0 ${newpid} 2>/dev/null && echo YES || echo NO`) === 'YES';
      }
      res.end(JSON.stringify({ ok: alive, pid: newpid, alive }));
      break;
    }

    default:
      res.end(JSON.stringify({ ok: false, error: 'Unknown action', actions: ['read_all','guardian_status','set','restart_guardian'] }));
  }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`\n  🛡️  APE Quality Manifest API — Local ADB Bridge`);
  console.log(`  ───────────────────────────────────────────────`);
  console.log(`  Listening on: http://localhost:${PORT}`);
  console.log(`  ONN Device:   ${ONN}`);
  console.log(`  Guardian:     ${GUARDIAN_PATH}`);
  console.log(`\n  Endpoints:`);
  console.log(`    GET  ?action=read_all`);
  console.log(`    GET  ?action=guardian_status`);
  console.log(`    POST ?action=set&key=X&value=Y&ns=global`);
  console.log(`    POST ?action=restart_guardian`);
  console.log(`\n  Ctrl+C to stop\n`);
});
