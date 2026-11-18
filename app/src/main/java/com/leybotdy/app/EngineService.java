package com.leybotdy.app;

import android.app.*;
import android.content.Intent;
import android.os.*;
import java.io.*;

public class EngineService extends Service {
    static volatile String status = "none";
    static volatile java.lang.Process proc;
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
        final File binFile = new File(getApplicationInfo().nativeLibraryDir, "libllama_server.so");
        final File modelFile = new File(getFilesDir(), "model.gguf");
        new Thread(() -> {
            java.lang.Process me = null;
            try {
                if (!modelFile.isFile() || modelFile.length() < 1024L * 1024L)
                    throw new IOException("Modèle GGUF absent ou incomplet : " + modelFile);
                if (!binFile.isFile())
                    throw new IOException("Moteur natif absent : " + binFile + ". Vérifiez l'intégration de libllama_server.so pour armeabi-v7a.");
                // Le binaire doit être exécutable lorsqu'il est livré dans nativeLibraryDir.
                if (!binFile.canExecute() && !binFile.setExecutable(true, true))
                    throw new IOException("Le moteur natif n'est pas exécutable : " + binFile);
                ProcessBuilder pb = new ProcessBuilder(binFile.getAbsolutePath(), "-m", modelFile.getAbsolutePath(),
                        "--host", "127.0.0.1", "--port", "8080", "-c", "2048", "-t",
                        String.valueOf(Math.max(1, Math.min(8, getSharedPreferences("p", 0).getInt("t", 4)))));
                pb.redirectErrorStream(true);
                me = pb.start();
                proc = me;
                status = "starting";
                BufferedReader r = new BufferedReader(new InputStreamReader(me.getInputStream()));
                String line;
                while ((line = r.readLine()) != null) {
                    synchronized (log) { log.append(line).append('\n'); if (log.length() > 6000) log.delete(0, 3000); }
                }
                int exitCode = me.waitFor();
                if (proc == me) {
                    proc = null;
                    status = exitCode == 0 ? "none" : "error";
                    synchronized (log) { log.append("Moteur arrêté (code ").append(exitCode).append(").\n"); }
                }
            } catch (Exception e) {
                if (me != null) me.destroy();
                synchronized (log) { log.append(e.getClass().getSimpleName()).append(": ").append(e.getMessage()).append('\n'); }
                status = "error";
            }
        }, "leybotdy-engine").start();
    }

    static void stop() {
        java.lang.Process p = proc;
        proc = null;
        status = "none";
        if (p != null) {
            p.destroy();
            try {
                if (!p.waitFor(1500, java.util.concurrent.TimeUnit.MILLISECONDS)) p.destroyForcibly();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                p.destroyForcibly();
            }
        }
    }

    @Override public void onDestroy() {
        stop();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        super.onDestroy();
    }
}
