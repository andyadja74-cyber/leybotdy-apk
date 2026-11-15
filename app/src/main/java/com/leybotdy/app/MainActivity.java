package com.leybotdy.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.*;

public class MainActivity extends Activity {
    WebView web;
    Process server;
    File model;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        web.setWebViewClient(new WebViewClient());
        web.loadUrl("file:///android_asset/index.html");
        model = new File(getFilesDir(), "model.gguf");
        if (model.exists()) startServer(); else pick();
    }

    void pick() {
        toast("Choisissez votre fichier Gemma (.gguf)");
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(i, 1);
    }

    @Override protected void onActivityResult(int rq, int rs, Intent d) {
        if (rq == 1 && rs == RESULT_OK && d != null) {
            final Uri u = d.getData();
            toast("Copie du modèle en cours…");
            new Thread(() -> {
                try (InputStream in = getContentResolver().openInputStream(u);
                     OutputStream out = new FileOutputStream(model)) {
                    byte[] buf = new byte[1 << 16];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                } catch (Exception e) {
                    model.delete();
                    toast("Copie impossible : " + e.getMessage());
                    return;
                }
                runOnUiThread(this::startServer);
            }).start();
        } else if (!model.exists()) {
            toast("Aucun modèle choisi. Relancez l'application.");
        }
    }

    void startServer() {
        new Thread(() -> {
            try {
                String bin = getApplicationInfo().nativeLibraryDir + "/libllama_server.so";
                ProcessBuilder pb = new ProcessBuilder(bin, "-m", model.getAbsolutePath(),
                        "--host", "127.0.0.1", "--port", "8080", "-c", "2048", "-t", "4");
                pb.redirectErrorStream(true);
                server = pb.start();
                BufferedReader r = new BufferedReader(new InputStreamReader(server.getInputStream()));
                while (r.readLine() != null) { }
            } catch (Exception e) {
                toast("Moteur : " + e.getMessage());
            }
        }).start();
    }

    void toast(String m) { runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show()); }

    @Override protected void onDestroy() {
        if (server != null) server.destroy();
        super.onDestroy();
    }
}
