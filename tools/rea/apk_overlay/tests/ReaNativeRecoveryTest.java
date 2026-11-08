import android.content.Intent;
import android.net.Uri;
import com.ape.rea.ReaBridge;
import com.ape.rea.ReaLoadGovernor;
import java.util.Arrays;

/** Production recovery state and real Android Java Intent; no Android activity or player double. */
public final class ReaNativeRecoveryTest {
  private static int assertions;
  private static void check(boolean ok,String message){assertions++;if(!ok)throw new AssertionError(message);}
  private static void same(Object actual,Object expected,String message){check(expected==null?actual==null:expected.equals(actual),message);}

  public static void main(String[] args){
    ReaBridge.NativeRecovery state=new ReaBridge.NativeRecovery();
    check(!state.locked&&!state.nativeObserved(false),"fresh session has no observed frames");
    state.observeFrame();
    check(state.nativeObserved(false),"fresh native renderer may report delivered frames");
    check(!state.nativeObserved(true),"a configured Media3 graph is not a native bypass");
    check(state.request("critical_thermal",true),"thermal request schedules one full restart");
    check(state.locked&&state.pending&&!state.restarted,"old graph remains pending until activity recreation");
    check(!state.nativeObserved(false),"old frame observations cannot certify pending recovery");
    check(!state.request("video_effect_error",true),"a second trigger cannot schedule a restart loop");
    same(state.reason,"critical_thermal","first reason remains authoritative");
    state.acknowledgeRestart("critical_thermal");
    check(state.locked&&state.restarted&&!state.pending&&!state.rendered,"new native session waits for new frames");
    check(!state.nativeObserved(false),"recreation alone is not a rendered frame");
    state.observeFrame();
    check(state.nativeObserved(false),"native frames after recreation may be reported");
    check(!state.nativeObserved(true),"unexpected graph activation still prevents native claim");
    ReaLoadGovernor governor=new ReaLoadGovernor();
    for(long now=0;now<=120000;now+=2000){
      ReaLoadGovernor.Decision decision=governor.sample(now,100,0,1500,true,true,0,0,0,2,true,!state.locked);
      check(!decision.changed&&decision.bypass,"healthy windows cannot reopen effects in locked recovery");
    }
    state.reset();
    check(!state.locked&&!state.rendered&&"none".equals(state.reason),"new source/settings resets the recovery lock");
    check(!state.request("frame_loss_native_bypass",false),"no Activity means manual reopen, no fake restart");
    check(state.locked&&state.reopenRequired&&!state.pending,"manual reopen is explicit");
    state.observeFrame();
    check(!state.nativeObserved(false),"old frames with manual-reopen requirement are not native proof");
    state.reset();state.request("https://fixture.invalid/private-token",true);
    same(state.reason,"capacity_fallback","unknown reason is not echoed as a credential-bearing message");

    String uri="http://video.invalid:80/live/a.mpd?token=a%2Bb+c&sig=opaque";
    String headers="{\"Authorization\":\"Bearer fixture-only\",\"Cookie\":\"fixture=one\",\"Referer\":\"https://ref.invalid/\"}";
    Intent original=new Intent(Intent.ACTION_VIEW);
    original.setDataAndType(Uri.parse(uri),"application/dash+xml");
    original.setClassName("com.ape.crystalagent.rea","com.ape.crystalagent.PlayerActivity");
    original.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
    original.addCategory("fixture.category");
    original.putExtra("url",uri).putExtra("headers",headers).putExtra("ua","FixturePlayer/1")
      .putExtra("title","Canal de prueba").putExtra("rea_external",true)
      .putExtra("rea_mime_type","application/dash+xml").putExtra("custom_array",new String[]{"uno","dos"});
    Intent recovered=ReaBridge.nativeRecoveryIntent(original,"critical_thermal",123456L,false);
    same(recovered.getDataString(),uri,"signed data URI preserved verbatim");
    same(recovered.getStringExtra("url"),uri,"host source URL preserved verbatim");
    same(recovered.getStringExtra("headers"),headers,"authentication headers preserved verbatim");
    same(recovered.getStringExtra("ua"),"FixturePlayer/1","UA preserved");
    same(recovered.getStringExtra("title"),"Canal de prueba","title preserved");
    same(recovered.getType(),"application/dash+xml","MIME preserved");
    same(recovered.getComponent(),original.getComponent(),"player component preserved");
    check(recovered.getFlags()==original.getFlags(),"launch flags preserved");
    check(recovered.hasCategory("fixture.category"),"unrelated category preserved");
    check(Arrays.equals(recovered.getStringArrayExtra("custom_array"),new String[]{"uno","dos"}),"unrelated extras preserved");
    check(recovered.getBooleanExtra("rea_external",false),"external playback contract preserved");
    check(recovered.getLongExtra("rea_resume_ms",-1)==123456L,"VOD position preserved");
    check(recovered.getBooleanExtra("rea_native_recovery",false),"native recovery marker set");
    check(!recovered.getBooleanExtra("rea_error_recovery",true),"capacity recovery is not mislabeled an effect error");
    same(recovered.getStringExtra("effects"),"off","host starts without registering effects");
    check(!original.hasExtra("effects")&&!original.hasExtra("rea_native_recovery"),"intent preparation does not mutate the old request");
    Intent live=ReaBridge.nativeRecoveryIntent(recovered,"frame_loss_native_bypass",555L,true);
    check(!live.hasExtra("rea_resume_ms"),"live recovery does not seek a stale VOD position");
    same(live.getStringExtra("url"),uri,"live recovery keeps the source");
    Intent error=ReaBridge.nativeRecoveryIntent(original,"video_effect_error",0,false);
    check(error.getBooleanExtra("rea_error_recovery",false),"processing errors retain their distinct reason");
    Intent reset=ReaBridge.clearNativeRecoveryIntent(recovered);
    check(!reset.hasExtra("rea_native_recovery")&&!reset.hasExtra("rea_error_recovery")&&!reset.hasExtra("rea_native_recovery_reason")&&!reset.hasExtra("effects"),"explicit settings clear all recovery flags");
    same(reset.getStringExtra("url"),uri,"settings reset keeps the source");
    same(reset.getStringExtra("headers"),headers,"settings reset keeps authentication");
    check(reset.getLongExtra("rea_resume_ms",-1)==123456L,"settings reset preserves VOD bookmark");
    check(recovered.hasExtra("rea_native_recovery"),"reset copy does not mutate the prior request");
    boolean rejected=false;try{ReaBridge.nativeRecoveryIntent(null,"critical_thermal",0,false);}catch(IllegalArgumentException expected){rejected=true;}
    check(rejected,"missing playback request fails explicitly");
    System.out.println("{\"suite\":\"native_recovery\",\"assertions\":"+assertions+",\"passed\":true,\"android_activity_tested\":false,\"uses_test_doubles\":false}");
  }
}
