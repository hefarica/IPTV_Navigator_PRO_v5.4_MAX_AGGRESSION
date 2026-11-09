package com.ape.crystalagent;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * REA · Catalogo JIT — la flecha "V-->>R: Confirmar configuracion y URL estable
 * del catalogo" del contrato.
 *
 * QUE HACE
 *   1. Pide GET /jit/api/config al VPS (lectura abierta, sin clave) y muestra la
 *      configuracion vigente y las DOS URLs de catalogo que confirma el servidor.
 *   2. Da un boton para COPIAR la URL y otro para ABRIR OTT NAVIGATOR.
 *   3. Si no hay red, muestra las URLs conocidas y lo dice: no finge una
 *      confirmacion que no recibio.
 *
 * QUE **NO** HACE
 *   NO registra el proveedor en OTT. Eso es alta de UI (Ajustes -> Proveedor ->
 *   Anadir proveedor) y no existe un Intent publico documentado para hacerlo.
 *   El boton solo abre la app. Llamarlo "importar automaticamente" seria mentir;
 *   por eso se llama "Abrir OTT" y el texto dice que el alta la hace el operador.
 */
public final class JitLinkActivity extends Activity {

    private static final String TAG = "ApeJitLink";
    private static final String API = "https://iptv-ape.duckdns.org/jit/api/config";
    private static final String FALLBACK_CATALOGO =
            "https://iptv-ape.duckdns.org/jit/playlist-calidad.m3u8";
    private static final String FALLBACK_RAPIDO =
            "https://iptv-ape.duckdns.org/jit/playlist-resolver.m3u8";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView estado;
    private TextView textoCatalogo;
    private TextView textoRapido;
    private LinearLayout detalle;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int pad = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(Color.parseColor("#0B1220"));

        TextView titulo = new TextView(this);
        titulo.setText("REA · Catalogo JIT");
        titulo.setTextColor(Color.parseColor("#E2E8F0"));
        titulo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        root.addView(titulo);

        estado = new TextView(this);
        estado.setText("Consultando el servidor...");
        estado.setTextColor(Color.parseColor("#94A3B8"));
        estado.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        estado.setPadding(0, dp(6), 0, dp(14));
        root.addView(estado);

        // ── catalogo de calidad (el que da la mejora) ──
        root.addView(rotulo("CATALOGO DE CALIDAD (JIT bajo demanda)"));
        textoCatalogo = urlCaja(root, FALLBACK_CATALOGO);

        // ── catalogo completo por el JIT ──
        root.addView(rotulo("TODO EL CATALOGO POR EL JIT"));
        textoRapido = urlCaja(root, FALLBACK_RAPIDO);

        // ── acciones ──
        LinearLayout fila = new LinearLayout(this);
        fila.setOrientation(LinearLayout.HORIZONTAL);
        fila.setPadding(0, dp(14), 0, 0);

        Button copiar = new Button(this);
        copiar.setText("Copiar URL de calidad");
        copiar.setAllCaps(false);
        copiar.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("catalogo", textoCatalogo.getText()));
                    Toast.makeText(JitLinkActivity.this, "URL copiada", Toast.LENGTH_SHORT).show();
                }
            }
        });
        fila.addView(copiar, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button abrir = new Button(this);
        abrir.setText("Abrir OTT");
        abrir.setAllCaps(false);
        abrir.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                /* NO registra el proveedor: solo abre OTT. El alta la hace el
                 * operador en Ajustes -> Proveedor -> Anadir proveedor. */
                Intent ri = getPackageManager().getLaunchIntentForPackage("studio.scillarium.ottnavigator");
                if (ri == null) {
                    Toast.makeText(JitLinkActivity.this,
                            "OTT Navigator no esta instalado", Toast.LENGTH_LONG).show();
                    return;
                }
                ri.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(ri);
            }
        });
        fila.addView(abrir, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(fila);

        TextView aviso = new TextView(this);
        aviso.setText("El alta del proveedor la haces tu: Ajustes -> Proveedor -> "
                + "Anadir proveedor -> Lista de reproduccion, y pegas la URL.\n"
                + "No hay Intent publico de OTT para registrarlo solo.");
        aviso.setTextColor(Color.parseColor("#F59E0B"));
        aviso.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        aviso.setPadding(0, dp(12), 0, dp(10));
        root.addView(aviso);

        detalle = new LinearLayout(this);
        detalle.setOrientation(LinearLayout.VERTICAL);
        root.addView(detalle);

        ScrollView sc = new ScrollView(this);
        sc.addView(root);
        setContentView(sc);

        consultar();
    }

    private TextView rotulo(String t) {
        TextView tv = new TextView(this);
        tv.setText(t);
        tv.setTextColor(Color.parseColor("#A5B4FC"));
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        tv.setPadding(0, dp(8), 0, dp(4));
        return tv;
    }

    private TextView urlCaja(LinearLayout root, String inicial) {
        TextView tv = new TextView(this);
        tv.setText(inicial);
        tv.setTextColor(Color.parseColor("#38BDF8"));
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tv.setTextIsSelectable(true);
        tv.setPadding(dp(10), dp(10), dp(10), dp(10));
        tv.setBackgroundColor(Color.parseColor("#111C2E"));
        root.addView(tv);
        return tv;
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getResources().getDisplayMetrics());
    }

    /** Pide la confirmacion al VPS. Si falla, LO DICE y deja las URLs conocidas. */
    private void consultar() {
        new Thread(new Runnable() {
            public void run() {
                String cat = null, rap = null, conf = null, err = null;
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(API).openConnection();
                    c.setConnectTimeout(6000);
                    c.setReadTimeout(9000);
                    c.setRequestMethod("GET");
                    int code = c.getResponseCode();
                    if (code == 200) {
                        StringBuilder sb = new StringBuilder();
                        BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
                        String l;
                        while ((l = br.readLine()) != null) sb.append(l);
                        br.close();
                        JSONObject j = new JSONObject(sb.toString());
                        JSONObject k = j.optJSONObject("contract");
                        if (k != null) {
                            cat = k.optString("catalog_url", null);
                            rap = k.optString("catalog_alt", null);
                            conf = k.optString("version", null) + " · " + k.optString("mode", null);
                        }
                        JSONObject cfg = j.optJSONObject("config");
                        if (cfg != null) {
                            conf = (conf == null ? "" : conf + "\n") +
                                   "perfil=" + cfg.optString("profile", "?") +
                                   "  target=" + cfg.optString("target", "?") +
                                   "  receta=" + cfg.optString("recipe", "?");
                        }
                    } else {
                        err = "HTTP " + code;
                    }
                    c.disconnect();
                } catch (Exception e) {
                    err = e.getClass().getSimpleName() + ": " + e.getMessage();
                }

                final String fCat = cat, fRap = rap, fConf = conf, fErr = err;
                ui.post(new Runnable() {
                    public void run() {
                        if (fCat != null && fCat.length() > 0) textoCatalogo.setText(fCat);
                        if (fRap != null && fRap.length() > 0) textoRapido.setText(fRap);
                        if (fErr == null) {
                            estado.setText("Confirmado por el servidor\n" + (fConf == null ? "" : fConf));
                            estado.setTextColor(Color.parseColor("#10B981"));
                        } else {
                            estado.setText("Sin confirmacion del servidor (" + fErr
                                    + "). Se muestran las URLs conocidas: no se finge una confirmacion.");
                            estado.setTextColor(Color.parseColor("#F59E0B"));
                        }
                    }
                });
            }
        }, "jit-link").start();
    }
}
