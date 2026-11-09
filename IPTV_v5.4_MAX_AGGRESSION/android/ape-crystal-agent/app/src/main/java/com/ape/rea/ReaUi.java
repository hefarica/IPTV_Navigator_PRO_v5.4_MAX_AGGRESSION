package com.ape.rea;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

/** Native Android/TV controls; existing player and settings UI stay usable. */
public final class ReaUi {
  private static final String TAG="ape_rea_controls";
  private static final int INK=Color.rgb(231,239,248),MUTED=Color.rgb(174,194,213);
  private ReaUi(){}
  public static void install(final Activity a){
    if(a==null||a.isFinishing())return;
    a.runOnUiThread(new Runnable(){public void run(){
      try{
        View content=a.findViewById(android.R.id.content);
        if(content==null||content.findViewWithTag(TAG)!=null)return;
        LinearLayout parent=findColumn(content);if(parent==null)return;
        Button button=new Button(a);button.setTag(TAG);button.setText("REA · Imagen y enlace OTT");
        button.setTextColor(INK);button.setAllCaps(false);button.setFocusable(true);
        button.setOnClickListener(new View.OnClickListener(){public void onClick(View v){show(a);}});
        parent.addView(button,0,new LinearLayout.LayoutParams(-1,-2));
      }catch(RuntimeException ignored){}
    }});
  }
  private static LinearLayout findColumn(View v){
    if(v instanceof LinearLayout&&((LinearLayout)v).getOrientation()==LinearLayout.VERTICAL)return (LinearLayout)v;
    if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){LinearLayout l=findColumn(g.getChildAt(i));if(l!=null)return l;}}
    return null;
  }
  private static int dp(Activity a,int v){return Math.round(v*a.getResources().getDisplayMetrics().density);}
  private static TextView label(Activity a,LinearLayout body,String value,int size){
    TextView t=new TextView(a);t.setText(value);t.setTextColor(INK);t.setTextSize(size);t.setPadding(0,dp(a,9),0,dp(a,5));body.addView(t);return t;
  }
  private static RadioGroup choices(Activity a,LinearLayout body,String[] options,int selected){
    RadioGroup g=new RadioGroup(a);g.setOrientation(RadioGroup.VERTICAL);
    for(int i=0;i<options.length;i++){RadioButton b=new RadioButton(a);b.setId(i+1);b.setText(options[i]);b.setTextColor(INK);b.setFocusable(true);g.addView(b);}
    g.check(selected+1);body.addView(g);return g;
  }
  private static SeekBar slider(final Activity a,LinearLayout body,final String name,int max,int initial){
    final TextView caption=label(a,body,name+": "+initial+" %",15);
    SeekBar s=new SeekBar(a);s.setMax(max);s.setProgress(Math.min(max,Math.max(0,initial)));s.setFocusable(true);
    s.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
      public void onProgressChanged(SeekBar s,int n,boolean user){caption.setText(name+": "+n+" %");}
      public void onStartTrackingTouch(SeekBar s){}public void onStopTrackingTouch(SeekBar s){}
    });body.addView(s,new LinearLayout.LayoutParams(-1,dp(a,44)));return s;
  }
  private static Button action(Activity a,LinearLayout body,String name,View.OnClickListener listener){
    Button b=new Button(a);b.setText(name);b.setAllCaps(false);b.setFocusable(true);b.setTextColor(Color.rgb(0,38,43));
    b.setOnClickListener(listener);body.addView(b,new LinearLayout.LayoutParams(-1,-2));return b;
  }
  public static void show(final Activity a){
    ReaBridge.applyDefaults(a);final SharedPreferences p=ReaBridge.prefs(a);
    ScrollView scroller=new ScrollView(a);final LinearLayout body=new LinearLayout(a);body.setOrientation(LinearLayout.VERTICAL);
    body.setPadding(dp(a,18),dp(a,10),dp(a,18),dp(a,18));body.setBackgroundColor(Color.rgb(13,27,44));scroller.addView(body);
    label(a,body,"Motor REA · Prueba",22);
    label(a,body,"Objetivos: ≤720p → 1440p · 1080p → 2160p · 4K → 3240p. La carga y el dispositivo pueden reducir el procesamiento.",15).setTextColor(MUTED);
    String mode=p.getString("rea_quality_mode","auto");int selected="lite".equals(mode)?1:"detail".equals(mode)?2:"off".equals(mode)?3:0;
    label(a,body,"Calidad",18);
    final RadioGroup quality=choices(a,body,new String[]{"Automática · prioriza fluidez","Ligera · menor coste del filtro","Detalle · comienza con el filtro completo","Natural · desactivar efectos"},selected);
    label(a,body,"Altura máxima de procesamiento",18);int height=p.getInt("rea_max_height",3240);
    final RadioGroup resolution=choices(a,body,new String[]{"1440p","2160p (4K)","3240p (6K)"},height<=1440?0:height<=2160?1:2);
    final CheckBox hdr=new CheckBox(a);hdr.setText("Expansión SDR → HDR cuando la ruta sea compatible");hdr.setTextColor(INK);hdr.setChecked(p.getBoolean("hdr_expand_enabled",true));body.addView(hdr);
    label(a,body,"HDR se activa solo con formato, pantalla y ruta GL compatibles. El escalado no cambia la resolución física del televisor.",14).setTextColor(MUTED);
    final SeekBar sharp=slider(a,body,"Nitidez",100,p.getInt("sharpen_percent",40));
    final SeekBar noise=slider(a,body,"Reducción de ruido",100,p.getInt("denoise_percent",16));
    final SeekBar color=slider(a,body,"Color",15,p.getInt("vibrance_percent",7));
    final SeekBar contrast=slider(a,body,"Microcontraste",20,p.getInt("microcontrast_percent",8));
    label(a,body,"OTT Navigator",18);
    label(a,body,"Selecciona APE Crystal REA como reproductor externo en OTT. MediaSession permite controles y lectura de una URI publicada; por sí sola no entrega los fotogramas del reproductor interno.",14).setTextColor(MUTED);
    action(a,body,"Acceso a sesión OTT",new View.OnClickListener(){public void onClick(View v){ReaOttBridge.openNotificationSettings(a);}});
    action(a,body,"Abrir canal publicado por OTT",new View.OnClickListener(){public void onClick(View v){ReaOttBridge.openObserved(a);}});
    action(a,body,"Diagnóstico de imagen y sesión",new View.OnClickListener(){public void onClick(View v){showDiagnostics(a);}});
    new AlertDialog.Builder(a).setTitle("REA · Imagen y OTT").setView(scroller)
      .setNegativeButton("Cancelar",null).setPositiveButton("Aplicar",new DialogInterface.OnClickListener(){public void onClick(DialogInterface d,int which){
        int q=quality.getCheckedRadioButtonId()-1;String value=q==1?"lite":q==2?"detail":q==3?"off":"auto";
        int r=resolution.getCheckedRadioButtonId()-1;int cap=r==0?1440:r==1?2160:3240;
        p.edit().putString("rea_quality_mode",value).putString("image_profile",q==3?"natural":q==1?"lite":"crystal_uhd")
          .putBoolean("enhance_enabled",q!=3).putInt("rea_max_height",cap).putBoolean("hdr_expand_enabled",hdr.isChecked())
          .putInt("sharpen_percent",sharp.getProgress()).putInt("denoise_percent",noise.getProgress())
          .putInt("vibrance_percent",color.getProgress()).putInt("microcontrast_percent",contrast.getProgress())
          .putBoolean("rea_session_bypass",false).apply();ReaBridge.refreshAll(a);
      }}).show();
  }
  private static void showDiagnostics(Activity a){
    ScrollView s=new ScrollView(a);TextView t=new TextView(a);t.setPadding(dp(a,18),dp(a,10),dp(a,18),dp(a,18));
    t.setTextSize(14);t.setText(ReaBridge.diagnostics(a)+"\n\nOTT: "+ReaOttBridge.diagnostics(a));t.setTextIsSelectable(true);s.addView(t);
    new AlertDialog.Builder(a).setTitle("REA · Diagnóstico").setView(s).setPositiveButton("Cerrar",null).show();
  }
}
