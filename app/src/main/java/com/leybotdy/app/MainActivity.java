package com.leybotdy.app;

import android.app.Activity;
import android.content.*;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import android.speech.tts.TextToSpeech;
import android.widget.Toast;
import java.io.*;
import java.util.Locale;

public class MainActivity extends Activity {
    WebView web;
    File model;
    volatile int copying = -1;
    TextToSpeech tts;
    volatile boolean ttsReady = false;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        model = new File(getFilesDir(), "model.gguf");
        tts = new TextToSpeech(this, st -> {
            if (st == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(Locale.FRENCH);
                ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            }
        });
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient());
        web.loadUrl("file:///android_asset/index.html");
        if (model.exists()) startEngine();
    }

    void startEngine() {
        Intent i = new Intent(this, EngineService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
    }

    void pick() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(i, 1);
    }

    @Override protected void onActivityResult(int rq, int rs, Intent d) {
        if (rq != 1 || rs != RESULT_OK || d == null) return;
        final Uri u = d.getData();
        EngineService.stop();
        stopService(new Intent(this, EngineService.class));
        copying = 0;
        new Thread(() -> {
            File tmp = new File(getFilesDir(), "model.tmp");
            try (AssetFileDescriptor fd = getContentResolver().openAssetFileDescriptor(u, "r");
                 InputStream in = getContentResolver().openInputStream(u);
                 OutputStream out = new FileOutputStream(tmp)) {
                long len = fd.getLength(), done = 0;
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    if (len > 0) copying = (int) (done * 100 / len);
                }
            } catch (Exception e) {
                tmp.delete();
                copying = -1;
                toast("Copie impossible : " + e.getMessage());
                return;
            }
            model.delete();
            tmp.renameTo(model);
            copying = -1;
            runOnUiThread(this::startEngine);
        }).start();
    }

    class Bridge {
        @JavascriptInterface public String status() {
            if (copying >= 0) return "copying:" + copying;
            if (!model.exists()) return "nomodel";
            return EngineService.status;
        }
        @JavascriptInterface public void pick() { runOnUiThread(MainActivity.this::pick); }
        @JavascriptInterface public void reload() { runOnUiThread(MainActivity.this::startEngine); }
        @JavascriptInterface public void unload() {
            EngineService.stop();
            runOnUiThread(() -> stopService(new Intent(MainActivity.this, EngineService.class)));
        }
        @JavascriptInterface public String log() {
            synchronized (EngineService.log) {
                String t = EngineService.log.toString();
                return t.length() > 700 ? t.substring(t.length() - 700) : t;
            }
        }
        @JavascriptInterface public void speak(String t) {
            if (!ttsReady) { toast("Voix française non installée : ouvrez Paramètres > Voix."); return; }
            tts.speak(t, TextToSpeech.QUEUE_FLUSH, null, "m");
        }
        @JavascriptInterface public void stopSpeak() { if (tts != null) tts.stop(); }
        @JavascriptInterface public boolean speaking() { return tts != null && tts.isSpeaking(); }
        @JavascriptInterface public void voiceSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent("com.android.settings.TTS_SETTINGS")); }
                catch (Exception e) { startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)); }
            });
        }
        @JavascriptInterface public void copy(String t) {
            runOnUiThread(() -> {
                ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("t", t));
                toast("Copié");
            });
        }
    }

    void toast(String m) { runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show()); }

    @Override protected void onDestroy() {
        if (isFinishing()) {
            EngineService.stop();
            stopService(new Intent(this, EngineService.class));
        }
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }
}
