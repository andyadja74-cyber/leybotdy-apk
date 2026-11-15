package com.leybotdy.app;

import android.app.*;
import android.content.Intent;
import android.os.*;
import java.io.*;

public class EngineService extends Service {
    static volatile String status = "none";
    static volatile Process proc;
    static final StringBuilder log = new StringBuilder();

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent i, int f, int id) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel("e", "Moteur Gemma", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, "e");
        } else b = new Notification.Builder(this);
        startForeground(1, b.setContentTitle("LEYBOTDY").setContentText("Gemma est actif")
                .setSmallIcon(android.R.drawable.stat_notify_chat).build());
        launch();
        return START_NOT_STICKY;
    }

    void launch() {
        stop();
        status = "starting";
        synchronized (log) { log.setLength(0); }
        final String bin = getApplicationInfo().nativeLibraryDir + "/libllama_server.so";
        final String model = new File(getFilesDir(), "model.gguf").getAbsolutePath();
        new Thread(() -> {
            try {
                ProcessBuilder pb = new ProcessBuilder(bin, "-m", model, "--host", "127.0.0.1",
                        "--port", "8080", "-c", "2048", "-t", "4");
                pb.redirectErrorStream(true);
                Process me = pb.start();
                proc = me;
                BufferedReader r = new BufferedReader(new InputStreamReader(me.getInputStream()));
                String l;
                while ((l = r.readLine()) != null) {
                    synchronized (log) { log.append(l).append('\n'); if (log.length() > 6000) log.delete(0, 3000); }
                }
                if (proc == me) status = "error";
            } catch (Exception e) {
                synchronized (log) { log.append(e).append('\n'); }
                status = "error";
            }
        }).start();
    }

    static void stop() { Process p = proc; proc = null; status = "none"; if (p != null) p.destroy(); }

    @Override public void onDestroy() { stop(); super.onDestroy(); }
}
