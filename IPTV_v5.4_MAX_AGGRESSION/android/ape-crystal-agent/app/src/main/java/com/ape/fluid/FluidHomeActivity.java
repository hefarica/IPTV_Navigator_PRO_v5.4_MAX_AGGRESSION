package com.ape.fluid;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URI;
import java.util.Locale;
import java.util.UUID;

/** Local configuration and playback entry point; never starts the base service. */
public final class FluidHomeActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(8, 19, 33);
    private static final int SURFACE = Color.rgb(16, 34, 52);
    private static final int FIELD = Color.rgb(9, 25, 42);
    private static final int FOREGROUND = Color.rgb(236, 245, 250);
    private static final int MUTED = Color.rgb(163, 185, 203);
    private static final int ACCENT = Color.rgb(49, 213, 190);
    private static final int FOCUS = Color.rgb(246, 205, 96);
    private static final String[] PROFILE_KEYS = {"balanced", "reserve", "low_latency"};
    private static final String[] IMAGE_KEYS = {"crystal_uhd", "crystal_balanced", "lite", "natural"};

    private LinearLayout content;
    private LinearLayout remoteFields;
    private EditText channelId;
    private EditText primaryUrl;
    private EditText backupUrl;
    private EditText userAgent;
    private EditText vpsBase;
    private EditText vpsToken;
    private EditText deviceId;
    private Spinner bufferProfile;
    private Spinner maxHeight;
    private Spinner imageProfile;
    private CheckBox cacheEnabled;
    private CheckBox enhanceEnabled;
    private CheckBox recoveryEnabled;
    private CheckBox vpsEnabled;
    private SeekBar sharpen;
    private SeekBar denoise;
    private SeekBar vibrance;
    private SeekBar microcontrast;
    private TextView status;
    private String latestDiagnostics = "Todavía no hay datos de reproducción.";

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setBackgroundDrawable(colorBox(BACKGROUND, 0, BACKGROUND));
        if (acceptIncoming(getIntent())) {
            finish();
            return;
        }
        buildUi();
        loadSettings();
        try {
            FluidBridge.warmup(getApplicationContext());
        } catch (RuntimeException ignored) {
            status.setText("La preparación local se reintentará al reproducir.");
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (acceptIncoming(intent)) finish();
    }

    @Override protected void onResume() {
        super.onResume();
        if (!isFinishing()) refreshDiagnostics();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BACKGROUND);
        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setOrientation(LinearLayout.VERTICAL);
        wrapper.setGravity(Gravity.CENTER_HORIZONTAL);
        wrapper.setPadding(dp(18), dp(24), dp(18), dp(36));
        scroll.addView(wrapper, new ScrollView.LayoutParams(-1, -2));
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        float screenDp = getResources().getDisplayMetrics().widthPixels
                / getResources().getDisplayMetrics().density;
        wrapper.addView(content, new LinearLayout.LayoutParams(screenDp > 920 ? dp(860) : -1, -2));

        TextView badge = text("APE  /  FLUID  /  CRYSTAL UHD", 13, ACCENT);
        badge.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        content.addView(badge);
        TextView title = text("Tu reproducción, a tu ritmo", 29, FOREGROUND);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        add(content, title, 8);
        add(content, text("Configura un canal, ajusta la reserva y abre el reproductor.", 16, MUTED), 6);

        LinearLayout channel = section("Canal");
        channelId = input(channel, "Identificador del canal", "Ej. noticias", false, false);
        primaryUrl = input(channel, "URL HLS principal", "https://…/canal.m3u8", true, false);
        backupUrl = input(channel, "URL de respaldo · opcional", "Otra fuente del mismo canal", true, false);
        add(channel, text("Utiliza un respaldo del mismo canal para mantener el contenido al recuperar la señal.", 13, MUTED), 5);
        userAgent = input(channel, "User-Agent · opcional", "Vacío: usar el valor del reproductor", false, false);

        Button play = button("Reproducir", true);
        add(channel, play, 18);
        play.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) { launchPlayback(); }
        });

        LinearLayout playback = section("Fluidez y reserva");
        bufferProfile = spinner(playback, "Perfil de reproducción",
                new String[]{"Equilibrado", "Mayor reserva", "Menor latencia"});
        add(playback, text("Una reserva mayor ayuda ante variaciones de red y puede aumentar la espera inicial.", 13, MUTED), 5);
        maxHeight = spinner(playback, "Resolución máxima",
                new String[]{"1080p · Full HD", "2160p · 4K"});
        cacheEnabled = checkbox(playback, "Usar caché local (64 MB)");
        recoveryEnabled = checkbox(playback, "Intentar recuperar la reproducción automáticamente");

        LinearLayout image = section("Imagen");
        imageProfile = spinner(image, "Perfil Crystal", new String[]{
                "Crystal UHD · escalado y detalle", "Crystal equilibrado · detalle natural",
                "Ligero · prioridad a la fluidez", "Natural · imagen sin filtros"});
        add(image, text("Crystal UHD amplía hasta 2× por dimensión, dentro de la salida activa y hasta 4K. Si aumenta la pérdida de fotogramas, reduce el filtro durante la sesión.", 13, MUTED), 7);
        enhanceEnabled = checkbox(image, "Activar filtro de imagen para contenido SDR");
        sharpen = slider(image, "Nitidez", 35);
        denoise = slider(image, "Reducción de ruido", 20);
        vibrance = slider(image, "Intensidad de color", 5);
        vibrance.setMax(15);
        microcontrast = slider(image, "Microcontraste", 6);
        microcontrast.setMax(20);
        add(image, text("El contenido HDR conserva una ruta sin estos filtros SDR.", 13, MUTED), 12);
        enhanceEnabled.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override public void onCheckedChanged(CompoundButton button, boolean enabled) {
                sharpen.setEnabled(enabled);
                denoise.setEnabled(enabled);
                vibrance.setEnabled(enabled);
                microcontrast.setEnabled(enabled);
            }
        });

        LinearLayout remote = section("Configuración remota · opcional");
        vpsEnabled = checkbox(remote, "Usar mi servidor de configuración");
        add(remote, text("Puedes reproducir y ajustar la aplicación sin configurar un servidor.", 13, MUTED), 5);
        remoteFields = new LinearLayout(this);
        remoteFields.setOrientation(LinearLayout.VERTICAL);
        remote.addView(remoteFields, new LinearLayout.LayoutParams(-1, -2));
        vpsBase = input(remoteFields, "Dirección del servidor", "https://tu-servidor", true, false);
        vpsToken = input(remoteFields, "Token de acceso", "Token del servidor", false, true);
        deviceId = input(remoteFields, "Identificador del dispositivo", "Identificador único", false, false);
        vpsEnabled.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override public void onCheckedChanged(CompoundButton button, boolean enabled) {
                remoteFields.setVisibility(enabled ? View.VISIBLE : View.GONE);
            }
        });
        remoteFields.setVisibility(View.GONE);

        LinearLayout actions = section("Guardar y revisar");
        Button save = button("Guardar configuración", true);
        add(actions, save, 0);
        save.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) {
                if (saveAll(false)) {
                    status.setText("Configuración guardada. Los cambios de reproducción se aplican al abrir el canal.");
                    Toast.makeText(FluidHomeActivity.this, "Configuración guardada", Toast.LENGTH_SHORT).show();
                }
            }
        });
        Button diagnostic = button("Ver diagnóstico", false);
        add(actions, diagnostic, 10);
        diagnostic.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) { showDiagnostics(); }
        });
        Button base = button("Configuración del agente base", false);
        add(actions, base, 10);
        base.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) { confirmBaseAgent(); }
        });
        status = text("Listo para configurar un canal.", 14, MUTED);
        add(actions, status, 14);
        add(content, text("Versión integrada de prueba · recuperación y filtros SDR; HDR passthrough; no RIFE/SR neuronal.", 12, MUTED), 22);
        setContentView(scroll);
    }

    private void loadSettings() {
        SharedPreferences prefs = FluidStore.prefs(this);
        channelId.setText(prefs.getString("channel_id", ""));
        primaryUrl.setText(prefs.getString("primary_url", ""));
        backupUrl.setText(prefs.getString("backup_url", ""));
        userAgent.setText(prefs.getString("ua", ""));
        String profile = prefs.getString("buffer_profile", "balanced");
        for (int i = 0; i < PROFILE_KEYS.length; i++) {
            if (PROFILE_KEYS[i].equals(profile)) bufferProfile.setSelection(i);
        }
        maxHeight.setSelection(prefs.getInt("max_height", 2160) <= 1080 ? 0 : 1);
        String imageKey = prefs.getString("image_profile", "crystal_uhd");
        for (int i = 0; i < IMAGE_KEYS.length; i++) if (IMAGE_KEYS[i].equals(imageKey)) imageProfile.setSelection(i);
        cacheEnabled.setChecked(prefs.getBoolean("cache_enabled", true));
        int cacheMiB = prefs.getInt("cache_mib", 64);
        cacheEnabled.setText("Usar caché local (" + cacheMiB + " MB)");
        recoveryEnabled.setChecked(prefs.getBoolean("recovery_enabled", true));
        enhanceEnabled.setChecked(prefs.getBoolean("enhance_enabled", true));
        sharpen.setProgress(prefs.getInt("sharpen_percent", 35));
        denoise.setProgress(prefs.getInt("denoise_percent", 20));
        vibrance.setProgress(prefs.getInt("vibrance_percent", 5));
        microcontrast.setProgress(prefs.getInt("microcontrast_percent", 6));
        sharpen.setEnabled(enhanceEnabled.isChecked());
        denoise.setEnabled(enhanceEnabled.isChecked());
        vibrance.setEnabled(enhanceEnabled.isChecked());
        microcontrast.setEnabled(enhanceEnabled.isChecked());
        vpsBase.setText(prefs.getString("vps_base_url", ""));
        vpsToken.setText(prefs.getString("vps_token", ""));
        String id = prefs.getString("device_id", "");
        if (id.length() == 0) {
            id = UUID.randomUUID().toString();
            prefs.edit().putString("device_id", id).apply();
        }
        deviceId.setText(id);
        vpsEnabled.setChecked(prefs.getBoolean("vps_enabled", false));
        remoteFields.setVisibility(vpsEnabled.isChecked() ? View.VISIBLE : View.GONE);
    }

    private boolean acceptIncoming(Intent intent) {
        if (intent == null) return false;
        String incoming = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            incoming = intent.getData().toString();
        } else if (intent.hasExtra("url")) {
            incoming = intent.getStringExtra("url");
        }
        if (incoming == null || incoming.trim().length() == 0) return false;
        try {
            String value = validateHttpUrl(incoming.trim(), false);
            String ua = intent.getStringExtra("ua");
            if (ua == null) ua = "";
            validateUserAgent(ua);
            // External playback bypasses form saving. The bridge matches the URL
            // to a known channel or creates an isolated session without backup.
            return openPlayer(value, ua);
        } catch (IllegalArgumentException error) {
            showError("El enlace recibido o su User-Agent no son válidos. Usa una dirección HTTP o HTTPS.");
            return false;
        }
    }

    private boolean saveAll(boolean requireChannel) {
        String id = clean(channelId);
        String primary = clean(primaryUrl);
        String backup = clean(backupUrl);
        String ua = clean(userAgent);
        try {
            validateUserAgent(ua);
            if (requireChannel || primary.length() > 0 || backup.length() > 0 || id.length() > 0) {
                validateHttpUrl(primary, false);
                if (backup.length() > 0) validateHttpUrl(backup, false);
                if (id.length() == 0) throw new IllegalArgumentException("Escribe un identificador para el canal.");
            }
            String remoteBase = clean(vpsBase);
            if (vpsEnabled.isChecked()) {
                remoteBase = FluidStore.validateControlUrl(remoteBase);
                if (!clean(deviceId).matches("[A-Za-z0-9._-]{1,80}"))
                    throw new IllegalArgumentException("El dispositivo debe tener entre 1 y 80 letras, números, puntos o guiones.");
                String token = clean(vpsToken);
                if (token.length() < 16 || token.length() > 4096 || token.indexOf('\r') >= 0 || token.indexOf('\n') >= 0)
                    throw new IllegalArgumentException("Escribe un token de 16 a 4096 caracteres sin saltos de línea.");
            }
            // Validate the complete form before making persistent changes.
            if (primary.length() > 0) FluidStore.saveChannel(this, id, primary, backup, ua);
            SharedPreferences prefs = FluidStore.prefs(this);
            prefs.edit()
                    .putString("buffer_profile", PROFILE_KEYS[bufferProfile.getSelectedItemPosition()])
                    .putInt("max_height", maxHeight.getSelectedItemPosition() == 0 ? 1080 : 2160)
                    .putString("image_profile", IMAGE_KEYS[imageProfile.getSelectedItemPosition()])
                    .putBoolean("cache_enabled", cacheEnabled.isChecked())
                    .putInt("cache_mib", prefs.getInt("cache_mib", 64))
                    .putBoolean("enhance_enabled", enhanceEnabled.isChecked())
                    .putInt("sharpen_percent", sharpen.getProgress())
                    .putInt("denoise_percent", denoise.getProgress())
                    .putInt("vibrance_percent", vibrance.getProgress())
                    .putInt("microcontrast_percent", microcontrast.getProgress())
                    .putBoolean("recovery_enabled", recoveryEnabled.isChecked())
                    .putBoolean("vps_enabled", vpsEnabled.isChecked())
                    .putString("vps_base_url", remoteBase)
                    .putString("vps_token", clean(vpsToken))
                    .putString("device_id", clean(deviceId))
                    .apply();
            FluidBridge.warmup(getApplicationContext());
            refreshDiagnostics();
            return true;
        } catch (IllegalArgumentException error) {
            String message = error.getMessage();
            showError(message == null ? "Revisa los campos de configuración." : message);
            return false;
        } catch (RuntimeException error) {
            showError("No fue posible guardar toda la configuración. Revisa el diagnóstico e inténtalo de nuevo.");
            return false;
        }
    }

    private void launchPlayback() {
        if (!saveAll(true)) return;
        openPlayer(clean(primaryUrl), clean(userAgent));
    }

    private boolean openPlayer(String url, String ua) {
        Intent intent = new Intent();
        intent.setClassName(getPackageName(), "com.ape.crystalagent.PlayerActivity");
        intent.putExtra("url", url);
        if (ua.length() > 0) intent.putExtra("ua", ua);
        try {
            startActivity(intent);
            return true;
        } catch (RuntimeException error) {
            showError("No fue posible abrir el reproductor. Consulta el diagnóstico.");
            return false;
        }
    }

    private static void validateUserAgent(String value) {
        if (value.length() > 512) throw new IllegalArgumentException("El User-Agent es demasiado largo.");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < 32 || c == 127) {
                throw new IllegalArgumentException("El User-Agent contiene caracteres no admitidos.");
            }
        }
    }

    private static String validateHttpUrl(String value, boolean server) {
        try {
            if (value.length() > 8192) throw new IllegalArgumentException("La dirección es demasiado larga.");
            if (value.length() == 0) throw new IllegalArgumentException("Introduce una dirección de reproducción válida.");
            URI uri = new URI(value);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
            String host = uri.getHost();
            if ((!"http".equals(scheme) && !"https".equals(scheme)) || host == null || host.length() == 0) {
                throw new IllegalArgumentException("La dirección debe empezar por http:// o https:// y contener un servidor válido.");
            }
            if (value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0 || uri.getFragment() != null) {
                throw new IllegalArgumentException("La dirección contiene caracteres no admitidos.");
            }
            if (server) {
                boolean local = "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host)
                        || "::1".equals(host) || "[::1]".equals(host);
                if (!"https".equals(scheme) && !local) {
                    throw new IllegalArgumentException("El servidor remoto debe usar HTTPS. HTTP solo se admite en localhost.");
                }
                if (uri.getUserInfo() != null || uri.getQuery() != null) {
                    throw new IllegalArgumentException("Introduce la dirección base del servidor sin usuario, contraseña ni parámetros.");
                }
            }
            return value;
        } catch (java.net.URISyntaxException error) {
            throw new IllegalArgumentException("La dirección no tiene un formato válido.");
        }
    }

    private void refreshDiagnostics() {
        try {
            String result = FluidBridge.diagnostics(getApplicationContext());
            if (result != null && result.length() > 0) latestDiagnostics = result;
        } catch (RuntimeException error) {
            latestDiagnostics = "No se pudo leer el diagnóstico local en este momento.";
        }
    }

    private void showDiagnostics() {
        refreshDiagnostics();
        TextView report = text(latestDiagnostics, 13, FOREGROUND);
        report.setTypeface(Typeface.MONOSPACE);
        report.setTextIsSelectable(true);
        report.setPadding(dp(18), dp(14), dp(18), dp(14));
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BACKGROUND);
        scroll.addView(report, new ScrollView.LayoutParams(-1, -2));
        new AlertDialog.Builder(this).setTitle("Diagnóstico local")
                .setView(scroll).setPositiveButton("Cerrar", null).show();
    }

    private void confirmBaseAgent() {
        new AlertDialog.Builder(this)
                .setTitle("Abrir el agente base")
                .setMessage("Al abrir esta pantalla se inicia el servicio del agente base con su configuración independiente y sus conexiones al servidor registrado. La reproducción Crystal funciona sin abrirlo.")
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Abrir", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface dialog, int which) {
                        Intent intent = new Intent();
                        intent.setClassName(getPackageName(), "com.ape.crystalagent.MainActivity");
                        try { startActivity(intent); }
                        catch (RuntimeException error) { showError("No fue posible abrir la configuración del agente base."); }
                    }
                }).show();
    }

    private void showError(String message) {
        new AlertDialog.Builder(this).setTitle("Revisa la configuración")
                .setMessage(message).setPositiveButton("Entendido", null).show();
    }

    private LinearLayout section(String title) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(18), dp(18), dp(18), dp(18));
        box.setBackgroundDrawable(colorBox(SURFACE, 14, Color.rgb(34, 56, 76)));
        TextView heading = text(title, 20, FOREGROUND);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        box.addView(heading);
        add(content, box, 18);
        return box;
    }

    private EditText input(LinearLayout parent, String label, String hint, boolean uri, boolean password) {
        add(parent, text(label, 14, MUTED), 15);
        EditText input = new EditText(this);
        input.setTextSize(16);
        input.setTextColor(FOREGROUND);
        input.setHintTextColor(MUTED);
        input.setHint(hint);
        input.setSingleLine(true);
        input.setPadding(dp(12), dp(12), dp(12), dp(12));
        input.setMinHeight(dp(50));
        input.setBackgroundDrawable(focusBackground(FIELD, Color.rgb(48, 73, 95)));
        int variation = password ? InputType.TYPE_TEXT_VARIATION_PASSWORD
                : uri ? InputType.TYPE_TEXT_VARIATION_URI : InputType.TYPE_TEXT_VARIATION_NORMAL;
        input.setInputType(InputType.TYPE_CLASS_TEXT | variation | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        add(parent, input, 5);
        return input;
    }

    private Spinner spinner(LinearLayout parent, String label, String[] values) {
        add(parent, text(label, 14, MUTED), 15);
        Spinner result = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, values) {
            @Override public View getView(int position, View convertView, ViewGroup parent) {
                TextView view = (TextView) super.getView(position, convertView, parent);
                view.setTextColor(FOREGROUND);
                view.setTextSize(16);
                view.setPadding(dp(12), dp(14), dp(12), dp(14));
                return view;
            }
            @Override public View getDropDownView(int position, View convertView, ViewGroup parent) {
                TextView view = (TextView) super.getDropDownView(position, convertView, parent);
                view.setTextColor(FOREGROUND);
                view.setBackgroundColor(SURFACE);
                view.setPadding(dp(14), dp(16), dp(14), dp(16));
                return view;
            }
        };
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        result.setAdapter(adapter);
        result.setBackgroundDrawable(focusBackground(FIELD, Color.rgb(48, 73, 95)));
        result.setFocusable(true);
        add(parent, result, 5);
        return result;
    }

    private CheckBox checkbox(LinearLayout parent, String label) {
        CheckBox check = new CheckBox(this);
        check.setText(label);
        check.setTextColor(FOREGROUND);
        check.setTextSize(16);
        check.setMinHeight(dp(50));
        check.setPadding(dp(8), dp(7), dp(8), dp(7));
        check.setBackgroundDrawable(focusBackground(SURFACE, SURFACE));
        add(parent, check, 10);
        return check;
    }

    private SeekBar slider(LinearLayout parent, final String title, int initial) {
        final TextView label = text(title + ": " + initial + " %", 15, FOREGROUND);
        add(parent, label, 15);
        SeekBar result = new SeekBar(this);
        result.setMax(100);
        result.setProgress(initial);
        result.setKeyProgressIncrement(5);
        result.setPadding(dp(10), dp(10), dp(10), dp(10));
        result.setBackgroundDrawable(focusBackground(SURFACE, SURFACE));
        result.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int progress, boolean user) {
                label.setText(title + ": " + progress + " %");
            }
            @Override public void onStartTrackingTouch(SeekBar bar) { }
            @Override public void onStopTrackingTouch(SeekBar bar) { }
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(48));
        parent.addView(result, params);
        return result;
    }

    private Button button(String label, boolean primary) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(16);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? BACKGROUND : FOREGROUND);
        button.setMinHeight(dp(52));
        button.setPadding(dp(12), dp(8), dp(12), dp(8));
        button.setBackgroundDrawable(focusBackground(primary ? ACCENT : FIELD,
                primary ? ACCENT : Color.rgb(48, 73, 95)));
        return button;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setLineSpacing(dp(3), 1f);
        return view;
    }

    private void add(LinearLayout parent, View child, int marginTop) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(marginTop);
        parent.addView(child, params);
    }

    private StateListDrawable focusBackground(int fill, int border) {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_focused}, colorBox(fill, 8, FOCUS));
        states.addState(new int[]{android.R.attr.state_pressed}, colorBox(fill, 8, FOCUS));
        states.addState(new int[]{}, colorBox(fill, 8, border));
        return states;
    }

    private GradientDrawable colorBox(int fill, int radius, int border) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        drawable.setStroke(dp(2), border);
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String clean(EditText view) { return view.getText().toString().trim(); }
}
