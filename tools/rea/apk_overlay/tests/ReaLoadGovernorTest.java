import com.ape.rea.ReaLoadGovernor;

public final class ReaLoadGovernorTest {
  private static int assertions;
  private static void check(boolean ok,String message){assertions++;if(!ok)throw new AssertionError(message);}
  private static ReaLoadGovernor.Decision sample(ReaLoadGovernor g,long t,long frames,long drops,int q,int scale){
    return g.sample(t,frames,drops,1500,true,true,0,q,scale,2,false,true);
  }
  public static void main(String[] args){
    ReaLoadGovernor g=new ReaLoadGovernor();
    check(!sample(g,0,100,0,2,2).changed,"first sample must establish interval");
    check(!sample(g,2000,100,4,2,2).changed,"one bad window must not downgrade");
    ReaLoadGovernor.Decision d=sample(g,4000,100,4,2,2);
    check(d.quality==1&&d.scale==2,"reduce filter before geometry");
    check(!sample(g,6000,100,4,1,2).changed,"cooldown");
    check(!sample(g,8000,100,4,1,2).changed,"five second downgrade cooldown");
    d=sample(g,10000,100,4,1,2);check(d.quality==0&&d.scale==2,"next filter tier");
    sample(g,12000,100,4,0,2);sample(g,14000,100,4,0,2);
    d=sample(g,16000,100,4,0,2);check(d.scale==1,"resolution reduction after light tier");
    g.reset();sample(g,0,100,0,2,2);
    d=g.sample(2000,0,20,0,false,false,0,2,2,2,false,true);
    check(!d.changed,"network buffering must not be scored as GPU load");
    d=g.sample(4000,0,0,1500,true,true,0,2,2,2,false,true);
    check(!d.changed,"missing counters must not promote or downgrade");
    d=g.sample(6000,100,0,1500,true,true,4,2,2,2,false,true);
    check(d.bypass&&d.scale==0&&d.quality==0,"critical thermal bypass");
    d=g.sample(8000,100,0,1500,true,true,4,2,2,2,false,false);
    check(!d.changed,"user off stays off");
    g.reset();g.sample(0,0,0,1500,true,true,0,0,0,2,true,true);
    for(long t=2000;t<=40000;t+=2000){d=g.sample(t,100,0,1500,true,true,0,0,0,2,true,true);check(!d.changed,"no premature recovery");}
    d=g.sample(42000,100,0,1500,true,true,0,0,0,2,true,true);
    check(!d.bypass&&d.scale==0&&d.quality==0,"recover at native light tier");
    g.reset();sample(g,0,0,0,0,0);sample(g,2000,100,5,0,0);d=sample(g,4000,100,5,0,0);
    check(d.bypass,"persistent losses at native light tier bypass");
    g.reset();d=g.sample(0,0,0,0,false,false,3,2,2,2,false,true);
    check(d.quality==0&&d.scale==1,"severe thermal immediately trims geometry and quality");
    boolean rejected=false;try{g.sample(-1,0,0,0,false,false,0,1,1,2,false,true);}catch(IllegalArgumentException e){rejected=true;}
    check(rejected,"invalid telemetry rejected");
    System.out.println("{\"governor_assertions\":"+assertions+",\"status\":\"passed\"}");
  }
}
