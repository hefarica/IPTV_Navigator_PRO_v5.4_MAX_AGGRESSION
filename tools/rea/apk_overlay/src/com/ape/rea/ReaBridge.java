package com.ape.rea;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;
import android.view.Display;
import android.view.WindowManager;
import androidx.media3.common.Effect;
import androidx.media3.common.ColorInfo;
import androidx.media3.common.Format;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoFrameProcessingException;
import androidx.media3.exoplayer.DecoderCounters;
import androidx.media3.exoplayer.ExoPlayer;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Integration for the one foreground APE player. Source requests remain owned by APE. */
public final class ReaBridge {
  private static final long MIB=1048576L;
  private static final ReaState STATE=new ReaState();
  private static final Map<Object,Session> SESSIONS=new IdentityHashMap<Object,Session>();
  // Once setVideoEffects was called, an empty list cannot remove Media3's graph.
  private static final Map<Object,Boolean> EFFECT_GRAPHS=new IdentityHashMap<Object,Boolean>();
  private static boolean initialized;
  private ReaBridge(){}
  /** Pure recovery state; a native session stays locked until a new source/settings application. */
  public static final class NativeRecovery {
    public boolean locked,restarted,pending,reopenRequired,rendered;
    public String reason="none";
    public boolean request(String why,boolean canRestart){
      if(locked)return false;
      locked=true;reason=safeRecoveryReason(why);pending=canRestart;reopenRequired=!canRestart;
      return canRestart;
    }
    public void acknowledgeRestart(String why){locked=true;restarted=true;pending=false;reopenRequired=false;rendered=false;reason=safeRecoveryReason(why);}
    public void requireReopen(){locked=true;pending=false;reopenRequired=true;}
    public void observeFrame(){rendered=true;}
    public boolean nativeObserved(boolean graphRequested){return rendered&&!graphRequested&&!pending&&!reopenRequired;}
    public void reset(){locked=false;restarted=false;pending=false;reopenRequired=false;rendered=false;reason="none";}
  }
  private static String safeRecoveryReason(String reason){
    if("critical_thermal".equals(reason)||"frame_loss_native_bypass".equals(reason)||
        "playback_guard_video_stall".equals(reason)||"video_effect_error".equals(reason)||
        "host_bypass_requested".equals(reason)||"empty_effect_list".equals(reason)||
        "settings_require_reopen".equals(reason))return reason;
    return "capacity_fallback";
  }
  public static Intent nativeRecoveryIntent(Intent source,String reason,long position,boolean live){
    if(source==null)throw new IllegalArgumentException("Playback intent required");
    String safe=safeRecoveryReason(reason);
    Intent result=new Intent(source);
    result.putExtra("rea_native_recovery",true).putExtra("rea_native_recovery_reason",safe)
      .putExtra("rea_error_recovery","video_effect_error".equals(safe)).putExtra("effects","off");
    if(live)result.removeExtra("rea_resume_ms");
    else if(position>=0)result.putExtra("rea_resume_ms",position);
    return result;
  }
  public static Intent clearNativeRecoveryIntent(Intent source){
    if(source==null)throw new IllegalArgumentException("Playback intent required");
    Intent result=new Intent(source);
    result.removeExtra("rea_native_recovery");result.removeExtra("rea_native_recovery_reason");
    result.removeExtra("rea_error_recovery");result.removeExtra("effects");
    return result;
  }
  private static boolean effectGraphRequested(Object player){synchronized(SESSIONS){return Boolean.TRUE.equals(EFFECT_GRAPHS.get(player));}}
  /** Guard every host entry point: even setVideoEffects(empty) enables its compositor. */
  public static void applyHostEffects(Context context,Object object,List<Effect> effects){
    if(!(object instanceof ExoPlayer)||context==null)return;
    if(isBypassed(context)||effects==null||effects.isEmpty()){
      final Session s;synchronized(SESSIONS){s=SESSIONS.get(object);}
      if(s!=null&&effectGraphRequested(object)&&!s.recovery.locked)
        s.requestNativeRecovery(isBypassed(context)?"host_bypass_requested":"empty_effect_list");
      return;
    }
    ((ExoPlayer)object).setVideoEffects(effects);
    synchronized(SESSIONS){EFFECT_GRAPHS.put(object,Boolean.TRUE);}
  }
  public static SharedPreferences prefs(Context c){return c.getApplicationContext().getSharedPreferences("ape_fluid",0);}
  public static synchronized void applyDefaults(Context c){
    SharedPreferences p=prefs(c);SharedPreferences.Editor e=p.edit();
    if(!p.contains("image_profile"))e.putString("image_profile","crystal_uhd");
    if(!p.contains("enhance_enabled"))e.putBoolean("enhance_enabled",true);
    if(!p.contains("sharpen_percent"))e.putInt("sharpen_percent",40);
    if(!p.contains("denoise_percent"))e.putInt("denoise_percent",16);
    if(!p.contains("vibrance_percent"))e.putInt("vibrance_percent",7);
    if(!p.contains("microcontrast_percent"))e.putInt("microcontrast_percent",8);
    if(!p.contains("rea_quality_mode"))e.putString("rea_quality_mode","auto");
    if(!p.contains("rea_max_height"))e.putInt("rea_max_height",3240);
    if(!p.contains("hdr_expand_enabled"))e.putBoolean("hdr_expand_enabled",true);
    e.apply();configureState(c,false);
  }
  private static int bound(int v,int max){return Math.max(0,Math.min(max,v));}
  private static synchronized void configureState(Context c,boolean reset){
    SharedPreferences p=prefs(c);
    STATE.sharpen=bound(p.getInt("sharpen_percent",40),100)/100f;
    STATE.denoise=bound(p.getInt("denoise_percent",16),100)/100f;
    STATE.vibrance=bound(p.getInt("vibrance_percent",7),15)/100f;
    STATE.contrast=bound(p.getInt("microcontrast_percent",8),20)/100f;
    String mode=p.getString("rea_quality_mode","auto"),profile=p.getString("image_profile","crystal_uhd");
    int ceiling="lite".equals(mode)||"lite".equals(profile)?0:"crystal_balanced".equals(profile)?1:2;
    STATE.qualityCeiling=ceiling;
    STATE.maxProcessingHeight=Math.max(720,Math.min(3240,p.getInt("rea_max_height",3240)));
    if(reset||!initialized){
      STATE.quality="detail".equals(mode)?ceiling:Math.min(1,ceiling);STATE.scaleLevel=2;
      STATE.forceBypass=false;STATE.renderedFrames=0;STATE.inputWidth=0;STATE.inputHeight=0;
      STATE.outputWidth=0;STATE.outputHeight=0;STATE.status="Esperando fotogramas";initialized=true;
    }else STATE.quality=Math.min(STATE.quality,ceiling);
    STATE.memoryBudgetBytes=memoryBudget(c);
  }
  private static long memoryBudget(Context c){
    try{
      ActivityManager.MemoryInfo m=new ActivityManager.MemoryInfo();
      ((ActivityManager)c.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(m);
      if(m.lowMemory)return 96*MIB;
      if(m.totalMem>=6144*MIB&&m.availMem>=2048*MIB)return 448*MIB;
      if(m.totalMem>=4096*MIB&&m.availMem>=1536*MIB)return 384*MIB;
      if(m.totalMem>=3072*MIB&&m.availMem>=1024*MIB)return 256*MIB;
      if(m.totalMem>=2048*MIB&&m.availMem>=512*MIB)return 192*MIB;
    }catch(RuntimeException ignored){}
    return 112*MIB;
  }
  private static boolean hostSuppresses(){
    try{Method m=Class.forName("com.ape.crystalagent.ApePlayer").getDeclaredMethod("access$getSuppressVideoEffects$cp");return Boolean.TRUE.equals(m.invoke(null));}
    catch(Exception e){return false;}
  }
  public static boolean isBypassed(Context c){
    SharedPreferences p=prefs(c);
    return STATE.forceBypass||p.getBoolean("rea_session_bypass",false)||!p.getBoolean("enhance_enabled",true)||
      "natural".equals(p.getString("image_profile","crystal_uhd"))||"off".equals(p.getString("rea_quality_mode","auto"))||hostSuppresses();
  }
  public static List<Effect> effects(Context c,String profile){
    applyDefaults(c);
    if(isBypassed(c)||"natural".equals(profile))return Collections.emptyList();
    if("lite".equals(profile))STATE.quality=0;
    try{return Collections.<Effect>singletonList(new ReaAdaptiveEffect(c.getApplicationContext(),STATE,true));}
    catch(RuntimeException e){event(c,"effect_construction_failed");return Collections.emptyList();}
  }
  public static void onPlayerActivity(Activity a){
    try{
      ReaHdrBridge.setPlaybackContext(a);
      Intent intent=a.getIntent();
      boolean recovered=intent.getBooleanExtra("rea_native_recovery",false)||intent.getBooleanExtra("rea_error_recovery",false);
      String reason=recovered?safeRecoveryReason(intent.getStringExtra("rea_native_recovery_reason")):"none";
      if(recovered&&!intent.hasExtra("rea_native_recovery_reason"))reason="video_effect_error";
      prefs(a).edit().putBoolean("rea_session_bypass",recovered)
        .putString("rea_native_recovery_reason",reason)
        .putString("rea_recovery_status",recovered?"recreated_waiting_for_frames":"none").apply();
      configureState(a,true);STATE.forceBypass=recovered;
      if(recovered)STATE.status="Reproductor recreado sin efectos ("+reason+"); esperando fotogramas";
    }catch(RuntimeException e){STATE.forceBypass=true;Log.w("APE-REA","Enhancement setup unavailable");}
  }
  public static void attach(final Context c,final Object object){
    if(!(object instanceof ExoPlayer))return;
    final ExoPlayer player=(ExoPlayer)object;
    if(Looper.myLooper()!=player.getApplicationLooper()){
      new Handler(player.getApplicationLooper()).post(new Runnable(){public void run(){attach(c,object);}});return;
    }
    boolean graphRequested=effectGraphRequested(object);
    detach(object);Session s=new Session(c,player);
    synchronized(SESSIONS){SESSIONS.put(object,s);if(graphRequested)EFFECT_GRAPHS.put(object,Boolean.TRUE);}
    player.addListener(s);s.mediaSession=ReaPlaybackSession.create(c,player);s.handler.postDelayed(s,2000);
    if(c instanceof Activity){
      final Intent i=((Activity)c).getIntent();final long resume=i.getLongExtra("rea_resume_ms",-1);
      if(resume>=0){s.handler.postDelayed(new Runnable(){public void run(){
        try{if(!player.isCurrentMediaItemLive())player.seekTo(resume);}catch(RuntimeException ignored){}
      }},300);i.removeExtra("rea_resume_ms");}
    }
    event(c,"supervisor_attached");
  }
  public static void detach(Object object){
    final Session s;synchronized(SESSIONS){s=SESSIONS.remove(object);EFFECT_GRAPHS.remove(object);}
    if(s==null)return;
    s.closed=true;s.handler.removeCallbacksAndMessages(null);
    if(Looper.myLooper()==s.player.getApplicationLooper())s.closeListeners();
    else s.handler.post(new Runnable(){public void run(){s.closeListeners();}});
  }
  public static void reduceImage(Context c,Object object,String reason){
    final Session s;synchronized(SESSIONS){s=SESSIONS.get(object);}
    if(s==null)return;
    s.handler.post(new Runnable(){public void run(){
      if(s.closed||s.recovery.locked)return;s.governor.reset();
      if(STATE.quality>0)STATE.quality--;
      else if(STATE.scaleLevel>0){STATE.scaleLevel--;s.refreshEffects();}
      else{s.requestNativeRecovery(reason);return;}
      event(s.context,"playback_guard_reduce");
    }});
  }
  /** Color contracts are graph-wide. Rebuild on explicit settings application. */
  public static void refreshAll(Context c){
    prefs(c).edit().putBoolean("rea_session_bypass",false).remove("rea_native_recovery_reason")
      .putString("rea_recovery_status","none").apply();
    configureState(c,true);List<Session> sessions;
    synchronized(SESSIONS){sessions=new ArrayList<Session>(SESSIONS.values());}
    for(final Session s:sessions)s.handler.post(new Runnable(){public void run(){
      if(s.closed)return;s.governor.reset();s.recovery.reset();
      if(s.context instanceof Activity){
        Activity a=(Activity)s.context;
        if(!a.isFinishing()&&!a.isDestroyed()){
          Intent i=clearNativeRecoveryIntent(a.getIntent());
          try{if(!s.player.isCurrentMediaItemLive())i.putExtra("rea_resume_ms",s.player.getCurrentPosition());}catch(RuntimeException ignored){}
          a.setIntent(i);a.recreate();return;
        }
      }
      s.requestNativeRecovery("settings_require_reopen");
    }});
  }
  private static void event(Context c,String reason){Log.i("APE-REA",reason);prefs(c).edit().putString("rea_last_decision",reason).apply();}
  public static String diagnostics(Context c){
    SharedPreferences p=prefs(c);
    return p.getString("rea_diagnostics","Abre un canal para medir fuente, procesamiento y descartes.")+
      "\nHDR: "+p.getString("rea_hdr_status","Pendiente de formato y pantalla")+
      "\nDecisión: "+p.getString("rea_last_decision","Esperando reproducción");
  }
  private static final class Session implements Runnable,Player.Listener {
    final Context context;final ExoPlayer player;final Handler handler;
    final ReaLoadGovernor governor=new ReaLoadGovernor();volatile boolean closed;
    final NativeRecovery recovery=new NativeRecovery();ReaPlaybackSession mediaSession;
    DecoderCounters lastCounters;long lastRendered,lastDropped;int sourceW,sourceH;float sourceFps;boolean sourceHdr;
    Session(Context c,ExoPlayer p){
      context=c;player=p;handler=new Handler(p.getApplicationLooper());
      if(prefs(c).getBoolean("rea_session_bypass",false)){
        String reason=prefs(c).getString("rea_native_recovery_reason","capacity_fallback");
        if(c instanceof Activity&&(((Activity)c).getIntent().getBooleanExtra("rea_native_recovery",false)||
            ((Activity)c).getIntent().getBooleanExtra("rea_error_recovery",false)))recovery.acknowledgeRestart(reason);
        else recovery.request(reason,false);
      }
    }
    public void run(){
      if(closed)return;
      try{
        Format f=player.getVideoFormat();if(f!=null){sourceW=f.width;sourceH=f.height;sourceFps=f.frameRate;sourceHdr=ColorInfo.isTransferHdr(f.colorInfo);}
        DecoderCounters dc=player.getVideoDecoderCounters();long frames=0,drops=0;
        if(dc!=null){dc.ensureUpdated();
          if(dc==lastCounters&&dc.renderedOutputBufferCount>=lastRendered&&dc.droppedBufferCount>=lastDropped){
            frames=dc.renderedOutputBufferCount-lastRendered;drops=dc.droppedBufferCount-lastDropped;
          }
          lastCounters=dc;lastRendered=dc.renderedOutputBufferCount;lastDropped=dc.droppedBufferCount;
          if(dc.renderedOutputBufferCount>0)recovery.observeFrame();
        }
        int thermal=-1;if(Build.VERSION.SDK_INT>=29){PowerManager pm=(PowerManager)context.getSystemService(Context.POWER_SERVICE);if(pm!=null)thermal=pm.getCurrentThermalStatus();}
        SharedPreferences p=prefs(context);
        boolean enabled=p.getBoolean("enhance_enabled",true)&&!"natural".equals(p.getString("image_profile","crystal_uhd"))&&
          !"off".equals(p.getString("rea_quality_mode","auto"))&&!hostSuppresses()&&!recovery.locked;
        ReaLoadGovernor.Decision d=governor.sample(SystemClock.elapsedRealtime(),frames,drops,Math.max(0,player.getTotalBufferedDuration()),
          player.getPlaybackState()==Player.STATE_READY,player.isPlaying(),thermal,STATE.quality,STATE.scaleLevel,STATE.qualityCeiling,STATE.forceBypass,enabled);
        if(d.changed){boolean recreate=d.scale!=STATE.scaleLevel;
          STATE.quality=d.quality;STATE.scaleLevel=d.scale;
          if(d.bypass)requestNativeRecovery(d.reason);
          else{STATE.forceBypass=false;if(recreate)refreshEffects();event(context,d.reason);}
        }
        report(frames,drops,thermal,enabled);if(mediaSession!=null)mediaSession.update();
      }catch(RuntimeException e){event(context,"supervisor_window_unavailable");}
      if(!closed)handler.postDelayed(this,2000);
    }
    void refreshEffects(){if(closed||recovery.locked)return;try{applyHostEffects(context,player,effects(context,prefs(context).getString("image_profile","crystal_uhd")));}catch(RuntimeException e){event(context,"effect_update_failed");}}
    @Override public void onRenderedFirstFrame(){recovery.observeFrame();}
    void closeListeners(){try{player.removeListener(this);}catch(RuntimeException ignored){}if(mediaSession!=null){mediaSession.close();mediaSession=null;}}
    void report(long frames,long drops,int thermal,boolean enabled){
      String display="sin dato";
      try{Display d=((WindowManager)context.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay();
        if(Build.VERSION.SDK_INT>=23)display=d.getMode().getPhysicalWidth()+" × "+d.getMode().getPhysicalHeight()+" / "+String.format(Locale.US,"%.2f",d.getMode().getRefreshRate())+" Hz";
        else display=d.getWidth()+" × "+d.getHeight();
      }catch(RuntimeException ignored){}
      boolean graph=effectGraphRequested(player),nativeApplied=recovery.nativeObserved(graph);
      String processing=nativeApplied?"ruta nativa; fotogramas recibidos":
        recovery.pending?"reinicio nativo pendiente; compositor anterior aún activo":
        recovery.reopenRequired?"requiere reabrir el canal para retirar el compositor":
        graph?STATE.outputWidth+" × "+STATE.outputHeight:"sin efectos configurados; esperando fotogramas";
      String text="Fuente: "+sourceW+" × "+sourceH+(sourceFps>0?" / "+sourceFps+" fps":"")+
        "\nProcesamiento: "+processing+
        "\nPantalla: "+display+"\nPerfil: "+(nativeApplied?"Natural / bypass":new String[]{"Ligero","Equilibrado","Detalle"}[STATE.quality])+
        "\nFrames decoder (~2 s): "+frames+" / descartes: "+drops+
        "\nTérmica: "+(thermal<0?"no disponible":String.valueOf(thermal))+
        "\nReserva del efecto: "+STATE.memoryBudgetBytes/MIB+" MiB\nGL: "+STATE.status+
        (recovery.locked?"\nRecuperación: "+recovery.reason+" (bloqueada hasta nuevo canal o aplicar ajustes)":"")+
        "\nLos contadores no miden el panel físico.";
      prefs(context).edit().putString("rea_diagnostics",text).putInt("crystal_input_width",sourceW>0?sourceW:STATE.inputWidth)
        .putInt("crystal_input_height",sourceH>0?sourceH:STATE.inputHeight).putInt("crystal_output_width",nativeApplied?sourceW:(graph?STATE.outputWidth:0))
        .putInt("crystal_output_height",nativeApplied?sourceH:(graph?STATE.outputHeight:0))
        .putBoolean("crystal_hdr_passthrough",nativeApplied&&sourceHdr).apply();
    }
    void requestNativeRecovery(String reason){
      if(closed||recovery.locked)return;
      final Activity activity=context instanceof Activity?(Activity)context:null;
      boolean canRestart=activity!=null&&!activity.isFinishing()&&!activity.isDestroyed();
      recovery.request(reason,canRestart);STATE.forceBypass=true;
      prefs(context).edit().putBoolean("rea_session_bypass",true)
        .putString("rea_native_recovery_reason",recovery.reason)
        .putString("rea_recovery_status",canRestart?"restart_pending":"reopen_required").apply();
      STATE.status=canRestart?"Reinicio nativo pendiente: "+recovery.reason:"Reabrir el canal para retirar el compositor: "+recovery.reason;
      event(context,"native_recovery_"+recovery.reason);
      if(!canRestart)return;
      long position=-1;boolean live=true;
      try{live=player.isCurrentMediaItemLive();if(!live)position=player.getCurrentPosition();}catch(RuntimeException ignored){}
      final Intent recoveryIntent=nativeRecoveryIntent(activity.getIntent(),recovery.reason,position,live);
      activity.setIntent(recoveryIntent);
      // The host may detach Session during its error fallback. Independent handler survives.
      new Handler(Looper.getMainLooper()).postDelayed(new Runnable(){public void run(){
        if(activity.getIntent()!=recoveryIntent)return; // A new source supersedes this recovery.
        if(!activity.isFinishing()&&!activity.isDestroyed()){
          try{activity.recreate();return;}catch(RuntimeException ignored){}
        }
        recovery.requireReopen();prefs(context).edit().putString("rea_recovery_status","reopen_required").apply();
      }},100);
    }
    @Override public void onPlayerError(PlaybackException error){
      boolean processing=error.errorCode==7000||error.errorCode==7001;Throwable cause=error;
      for(int n=0;cause!=null&&n<12;n++,cause=cause.getCause())if(cause instanceof VideoFrameProcessingException)processing=true;
      if(processing)requestNativeRecovery("video_effect_error");
    }
  }
}
