package com.leybotdy.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import android.Manifest;
import android.content.pm.PackageManager;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import org.json.JSONObject;
import java.util.ArrayList;
import android.widget.Toast;
import java.io.*;
import java.util.Locale;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

public class MainActivity extends Activity {
    WebView web;
    File model;
    volatile int copying = -1;
    TextToSpeech tts;
    float rate = 1f;
    SpeechRecognizer sr;
    boolean pendingListen = false;
    volatile boolean ttsReady = false;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        model = new File(getFilesDir(), "model.gguf");
        tts = new TextToSpeech(this, st -> {
            if (st == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(Locale.FRENCH);
                ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { js("window.onSpoken&&onSpoken(" + JSONObject.quote(id) + ")"); }
                    @Override public void onError(String id) { js("window.onSpoken&&onSpoken(" + JSONObject.quote(id) + ")"); }
                });
            }
        });
        web = new WebView(this);
        getWindow().setStatusBarColor(0xFF08090E);
        getWindow().setNavigationBarColor(0xFF08090E);
        web.setBackgroundColor(0xFF08090E);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true); // nécessaire pour charger les assets locaux
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                // L'interface reste dans les assets locaux ; aucune navigation web externe.
                return !("file".equals(target.getScheme()) && target.getPath() != null && target.getPath().startsWith("/android_asset/"));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !(url != null && url.startsWith("file:///android_asset/"));
            }
        });
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
            long done = 0;
            try (InputStream in = getContentResolver().openInputStream(u)) {
                if (in == null) throw new IOException("Le fournisseur n’a pas ouvert le fichier.");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[1 << 16];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        if (n == 0) continue;
                        out.write(buf, 0, n);
                        done += n;
                        // La taille exacte n'est pas toujours fournie par les fournisseurs cloud.
                        copying = (int) Math.min(99, done / (1024L * 1024L));
                    }
                    out.getFD().sync();
                }
                if (!tmp.isFile() || tmp.length() < 1024L * 1024L)
                    throw new IOException("Le fichier GGUF est vide ou incomplet.");
                try {
                    Files.move(tmp.toPath(), model.toPath(), StandardCopyOption.REPLACE_EXISTING,
                            StandardCopyOption.ATOMIC_MOVE);
                } catch (Exception atomicError) {
                    Files.move(tmp.toPath(), model.toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
                copying = -1;
                runOnUiThread(this::startEngine);
            } catch (Exception e) {
                // Ne jamais supprimer l'ancien modèle valide si l'import échoue.
                // Le fichier temporaire est uniquement supprimé après l'échec.
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                copying = -1;
                toast("Copie impossible : " + e.getMessage());
            }
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
            tts.setSpeechRate(rate);
            tts.speak(t, TextToSpeech.QUEUE_FLUSH, null, "m");
        }
        @JavascriptInterface public int freeMb() {
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            ((ActivityManager) getSystemService(ACTIVITY_SERVICE)).getMemoryInfo(mi);
            return (int) (mi.availMem >> 20);
        }
        @JavascriptInterface public void setThreads(int n) { getSharedPreferences("p", 0).edit().putInt("t", n).apply(); }
        @JavascriptInterface public void setRate(double r) { rate = (float) r; }
        @JavascriptInterface public void speakQ(String t, String id) {
            if (!ttsReady) { js("window.onSpoken&&onSpoken(" + JSONObject.quote(id) + ")"); return; }
            tts.setSpeechRate(rate);
            tts.speak(t, TextToSpeech.QUEUE_ADD, null, id);
        }
        @JavascriptInterface public boolean speechAvailable() { return SpeechRecognizer.isRecognitionAvailable(MainActivity.this); }
        @JavascriptInterface public void listen() {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    pendingListen = true;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 7);
                } else listenNow();
            });
        }
        @JavascriptInterface public void stopListen() { runOnUiThread(() -> { if (sr != null) sr.cancel(); }); }
        @JavascriptInterface public void stopSpeak() { if (tts != null) tts.stop(); }
        @JavascriptInterface public boolean speaking() { return tts != null && tts.isSpeaking(); }
        @JavascriptInterface public void voiceSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent("com.android.settings.TTS_SETTINGS")); }
                catch (Exception e) { startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)); }
            });
        }
        @JavascriptInterface public void share(String t) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, t);
                startActivity(Intent.createChooser(i, "Partager"));
            });
        }
        @JavascriptInterface public void copy(String t) {
            runOnUiThread(() -> {
                ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("t", t));
                toast("Copié");
            });
        }
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("window.goBack?goBack():false", v -> { if (!"true".equals(v)) moveTaskToBack(true); });
    }

    void js(final String s) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(s, null); }); }

    void listenNow() {
        if (sr == null) {
            sr = SpeechRecognizer.createSpeechRecognizer(this);
            sr.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle b) { js("window.onSpeech&&onSpeech('ready','')"); }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float v) { }
                @Override public void onBufferReceived(byte[] b) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onError(int e) { js("window.onSpeech&&onSpeech('error','" + e + "')"); }
                @Override public void onResults(Bundle b) { send("final", b); }
                @Override public void onPartialResults(Bundle b) { send("partial", b); }
                @Override public void onEvent(int t, Bundle b) { }
                void send(String type, Bundle b) {
                    ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (l != null && !l.isEmpty()) js("window.onSpeech&&onSpeech('" + type + "'," + JSONObject.quote(l.get(0)) + ")");
                }
            });
        }
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        sr.startListening(i);
    }

    @Override public void onRequestPermissionsResult(int rc, String[] p, int[] r) {
        super.onRequestPermissionsResult(rc, p, r);
        if (rc != 7) return;
        if (r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) {
            if (pendingListen) { pendingListen = false; listenNow(); }
        } else { pendingListen = false; js("window.onSpeech&&onSpeech('error','perm')"); }
    }

    void toast(String m) { runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show()); }

    @Override protected void onDestroy() {
        if (isFinishing()) {
            EngineService.stop();
            stopService(new Intent(this, EngineService.class));
        }
        if (sr != null) sr.destroy();
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }
}
