package com.ape.rea;
import android.app.Activity;
import android.content.Context;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.SystemClock;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

/** Session controls the REA-owned renderer, never OTT's internal pixel pipeline. */
public final class ReaPlaybackSession {
  private final ExoPlayer player;private final MediaSession session;private boolean closed;
  private ReaPlaybackSession(Context c,final ExoPlayer p){
    player=p;session=new MediaSession(c,"APE REA");session.setFlags(3);
    session.setCallback(new MediaSession.Callback(){
      @Override public void onPlay(){if(!closed){if(p.getPlaybackState()==Player.STATE_IDLE&&p.getMediaItemCount()>0)p.prepare();p.play();update();}}
      @Override public void onPause(){if(!closed){p.pause();update();}}
      @Override public void onStop(){if(!closed){p.stop();update();}}
      @Override public void onSeekTo(long pos){if(!closed&&p.isCurrentMediaItemSeekable()){p.seekTo(Math.max(0,pos));update();}}
    },new Handler(p.getApplicationLooper()));
    String title="APE REA · Imagen adaptativa";
    if(c instanceof Activity){String t=((Activity)c).getIntent().getStringExtra("title");if(t!=null&&!t.trim().isEmpty())title=t.substring(0,Math.min(160,t.length()));}
    session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,title).build());session.setActive(true);update();
  }
  public static ReaPlaybackSession create(Context c,ExoPlayer p){try{return new ReaPlaybackSession(c,p);}catch(RuntimeException e){return null;}}
  public void update(){if(closed)return;try{
    int s=player.getPlayerError()!=null?PlaybackState.STATE_ERROR:player.getPlaybackState()==Player.STATE_BUFFERING?PlaybackState.STATE_BUFFERING:
      player.getPlaybackState()==Player.STATE_ENDED?PlaybackState.STATE_STOPPED:player.isPlaying()?PlaybackState.STATE_PLAYING:PlaybackState.STATE_PAUSED;
    long actions=PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_PLAY_PAUSE|PlaybackState.ACTION_STOP;
    if(player.isCurrentMediaItemSeekable())actions|=PlaybackState.ACTION_SEEK_TO;
    session.setPlaybackState(new PlaybackState.Builder().setActions(actions).setState(s,Math.max(0,player.getCurrentPosition()),
      player.isPlaying()?player.getPlaybackParameters().speed:0f,SystemClock.elapsedRealtime()).setBufferedPosition(Math.max(0,player.getBufferedPosition())).build());
  }catch(RuntimeException ignored){}}
  public void close(){if(closed)return;closed=true;try{session.setActive(false);session.release();}catch(RuntimeException ignored){}}
}
