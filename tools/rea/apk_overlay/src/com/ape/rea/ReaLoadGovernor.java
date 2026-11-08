package com.ape.rea;

/** Adaptive policy based on decoder frame losses and thermal state, not fictitious GPU timing. */
public final class ReaLoadGovernor {
  public static final class Decision {
    public final int quality,scale; public final boolean bypass,changed; public final String reason;
    Decision(int q,int s,boolean b,boolean c,String r){quality=q;scale=s;bypass=b;changed=c;reason=r;}
  }
  private long lastSample=-1,lastChange=-100000,stableSince=-1;
  private int badWindows;
  public void reset(){lastSample=-1;lastChange=-100000;stableSince=-1;badWindows=0;}
  private static Decision result(int oq,int os,boolean ob,int q,int s,boolean b,String why){
    return new Decision(q,s,b,oq!=q||os!=s||ob!=b,why);
  }
  public Decision sample(long now,long rendered,long dropped,long buffer,
      boolean ready,boolean playing,int thermal,int q,int scale,int ceiling,boolean bypass,boolean enabled){
    if(now<0||rendered<0||dropped<0||buffer<0||q<0||q>2||scale<0||scale>2||ceiling<0||ceiling>2||thermal< -1||thermal>6)
      throw new IllegalArgumentException("Invalid telemetry");
    long elapsed=lastSample<0?0:now-lastSample;
    if(elapsed<0)throw new IllegalArgumentException("Non-monotonic clock");
    lastSample=now;
    if(!enabled){badWindows=0;stableSince=-1;return result(q,scale,bypass,q,scale,bypass,"user_bypass");}
    if(thermal>=4){badWindows=0;stableSince=-1;lastChange=now;return result(q,scale,bypass,0,0,true,"critical_thermal");}
    if(thermal==3){
      badWindows=0;stableSince=-1;
      if(now-lastChange>=4000){lastChange=now;return result(q,scale,bypass,0,Math.max(0,scale-1),bypass,"severe_thermal");}
      return result(q,scale,bypass,q,scale,bypass,"thermal_cooldown");
    }
    if(!ready||!playing||elapsed<1000||elapsed>10000||rendered+dropped<24){
      badWindows=0;stableSince=-1;return result(q,scale,bypass,q,scale,bypass,"insufficient_render_window");
    }
    if(dropped>=2&&(double)dropped/(rendered+dropped)>.01){
      badWindows++;stableSince=-1;
      if(badWindows>=2&&now-lastChange>=5000){
        badWindows=0;lastChange=now;
        if(q>0)return result(q,scale,bypass,q-1,scale,bypass,"frame_loss_reduce_filter");
        if(scale>0)return result(q,scale,bypass,0,scale-1,bypass,"frame_loss_reduce_resolution");
        return result(q,scale,bypass,0,0,true,"frame_loss_native_bypass");
      }
      return result(q,scale,bypass,q,scale,bypass,"confirming_frame_loss");
    }
    badWindows=0;
    if(dropped==0&&thermal<=1&&buffer>=1000){
      if(stableSince<0)stableSince=now;
      if(now-stableSince>=40000&&now-lastChange>=30000){
        stableSince=now;lastChange=now;
        if(bypass)return result(q,scale,bypass,0,0,false,"stable_resume_filter");
        if(q<Math.min(1,ceiling))return result(q,scale,bypass,q+1,scale,false,"stable_restore_balanced");
        if(scale<2)return result(q,scale,bypass,q,scale+1,false,"stable_restore_resolution");
        if(q<ceiling)return result(q,scale,bypass,q+1,scale,false,"stable_add_detail");
      }
    }else stableSince=-1;
    return result(q,scale,bypass,q,scale,bypass,"hold");
  }
}
