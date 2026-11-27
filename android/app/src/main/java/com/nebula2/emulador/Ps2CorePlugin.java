package com.nebula2.emulador;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.OpenableColumns;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.activity.result.ActivityResult;

import com.armsx2.BiosInfo;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.libsdl.app.SDL;
import org.libsdl.app.SDLControllerManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONObject;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.os.Build;
import java.util.concurrent.TimeUnit;

import kr.co.iefriends.pcsx2.NativeApp;

@CapacitorPlugin(name = "Ps2Core")
public class Ps2CorePlugin extends Plugin {
    private static volatile Ps2CorePlugin sInstance;

    private final Object initLock = new Object();
    private boolean initialized = false;
    private String initError = null;

    private SurfaceView surfaceView;
    private volatile boolean surfaceReady = false;
    private CountDownLatch surfaceLatch;
    private Thread emuThread;
    private volatile boolean running = false;
    private volatile boolean userPaused = false;
    private boolean vibration = true;
    private final java.util.concurrent.atomic.AtomicBoolean scanningFolder = new java.util.concurrent.atomic.AtomicBoolean(false);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable fpsTick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            try {
                JSObject o = new JSObject();
                o.put("fps", Math.round(NativeApp.getFPS()));
                notifyListeners("fps", o);
            } catch (Throwable ignored) {}
            main.postDelayed(this, 1000);
        }
    };

    @Override
    public void load() {
        sInstance = this;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        o.put("loaded", NativeApp.loaded);
        o.put("error", NativeApp.loaded ? null : NativeApp.loadError);
        o.put("running", running);
        call.resolve(o);
    }

    @PluginMethod
    public void pickIsos(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", true));
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "onIsosPicked");
    }

    @ActivityCallback
    private void onIsosPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSArray files = new JSArray();
        Intent data = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                for (int n = 0; n < data.getClipData().getItemCount(); n++) {
                    JSObject f = describe(data.getClipData().getItemAt(n).getUri());
                    if (f != null) files.put(f);
                }
            } else if (data.getData() != null) {
                JSObject f = describe(data.getData());
                if (f != null) files.put(f);
            }
        }
        JSObject o = new JSObject();
        o.put("files", files);
        call.resolve(o);
    }

    @PluginMethod
    public void pickBios(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(call, i, "onBiosPicked");
    }

    @PluginMethod
    public void pickGameFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "onGameFolderPicked");
    }

    @ActivityCallback
    private void onGameFolderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject empty = new JSObject();
            empty.put("files", new JSArray());
            call.resolve(empty);
            return;
        }
        Uri tree = data.getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            scanFolder(call, tree, true);
        } catch (Exception e) {
            call.reject("Permita o acesso à pasta para detectar os jogos.");
        }
    }

    @PluginMethod
    public void scanGameFolder(PluginCall call) {
        String saved = getContext().getSharedPreferences("game-library", Context.MODE_PRIVATE)
                .getString("tree", null);
        if (saved == null) {
            JSObject empty = new JSObject();
            empty.put("files", new JSArray());
            call.resolve(empty);
            return;
        }
        scanFolder(call, Uri.parse(saved), false);
    }

    private void scanFolder(PluginCall call, Uri tree, boolean save) {
        if (!scanningFolder.compareAndSet(false, true)) {
            call.reject("A busca de jogos já está em andamento.");
            return;
        }
        new Thread(() -> {
            try {
                JSObject result = GameFolderScanner.scan(getContext().getContentResolver(), tree);
                if (save) getContext().getSharedPreferences("game-library", Context.MODE_PRIVATE)
                        .edit().putString("tree", tree.toString()).apply();
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Não deu para ler a pasta. Selecione-a novamente e permita o acesso.");
            } finally {
                scanningFolder.set(false);
            }
        }, "nebula2-folder-scan").start();
    }

    @ActivityCallback
    private void onBiosPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.resolve(new JSObject());
            return;
        }
        final Uri uri = data.getData();
        new Thread(() -> {
            try {
                ensureInit();
                String name = displayName(uri);
                if (name == null || name.isEmpty()) name = "bios.bin";
                name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                File dir = biosDir();
                dir.mkdirs();
                File dest = new File(dir, name);
                try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                     OutputStream out = new FileOutputStream(dest)) {
                    if (in == null) throw new Exception("Não deu para abrir o arquivo.");
                    copy(in, out);
                }
                BiosInfo info = null;
                if (NativeApp.loaded) {
                    ParcelFileDescriptor pfd = ParcelFileDescriptor.open(dest, ParcelFileDescriptor.MODE_READ_ONLY);
                    info = NativeApp.getBiosInfoFromFd(pfd.detachFd());
                    if (info == null) {
                        dest.delete();
                        call.reject("Esse arquivo não é uma BIOS de PS2.");
                        return;
                    }
                }
                JSObject o = new JSObject();
                o.put("name", name);
                if (info != null) o.put("description", info.description + " " + info.versionString());
                call.resolve(o);
            } catch (Throwable t) {
                call.reject("Não deu para copiar a BIOS: " + t.getMessage());
            }
        }, "bios-copy").start();
    }

    private JSObject describe(Uri uri) {
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Throwable ignored) {}
        JSObject f = new JSObject();
        f.put("uri", uri.toString());
        String name = displayName(uri);
        f.put("name", name != null ? name : uri.getLastPathSegment());
        f.put("size", size(uri));
        return f;
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Throwable ignored) {}
        return null;
    }

    private long size(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Throwable ignored) {}
        return 0;
    }

    private File dataDir() {
        File d = getContext().getExternalFilesDir(null);
        return d != null ? d : getContext().getFilesDir();
    }

    private File biosDir() {
        return new File(dataDir(), "bios");
    }

    private void ensureInit() throws Exception {
        synchronized (initLock) {
            if (initialized) return;
            if (initError != null) throw new Exception(initError);
            if (!NativeApp.loaded) {
                initError = "O núcleo do emulador não veio dentro do app (" + NativeApp.loadError + ").";
                throw new Exception(initError);
            }
            Context ctx = getContext();
            File data = dataDir();
            long stamp = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).lastUpdateTime;
            File marker = new File(data, ".resources-" + stamp);
            if (!marker.exists()) {
                copyAssets(ctx.getAssets(), "resources", new File(data, "resources"));
                marker.createNewFile();
            }
            biosDir().mkdirs();
            NativeApp.initializeOnce(ctx, data.getAbsolutePath(), biosDir().getAbsolutePath());
            Activity act = getActivity();
            if (act != null) SDL.setContext(act);
            SDLControllerManager.nativeSetupJNI();
            SDLControllerManager.initialize();
            NativeApp.pauseListener = paused -> {
                JSObject o = new JSObject();
                o.put("paused", paused);
                notifyListeners("paused", o);
            };
            NativeApp.rumbleListener = this::rumble;
            initialized = true;
        }
    }

    private static void copyAssets(AssetManager am, String path, File dest) throws Exception {
        String[] list = am.list(path);
        if (list == null || list.length == 0) {
            dest.getParentFile().mkdirs();
            try (InputStream in = am.open(path); OutputStream out = new FileOutputStream(dest)) {
                copy(in, out);
            }
            return;
        }
        dest.mkdirs();
        for (String child : list) copyAssets(am, path + "/" + child, new File(dest, child));
    }

    private static void copy(InputStream in, OutputStream out) throws java.io.IOException {
        byte[] buf = new byte[64 * 1024];
        int r;
        while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
    }

    /**
     * Ajustes de imagem e desempenho do GS. As chaves seguem os nomes do INI do PCSX2.
     * "core" = não escreve nada, vale o padrão do núcleo. Chave desconhecida é ignorada pelo núcleo.
     */
    private void applyImageSettings(JSObject s) {
        String blending = s.getString("blending", "core");
        if (!"core".equals(blending)) NativeApp.setSetting("EmuCore/GS", "accurate_blending_unit", "int", blending);
        String preload = s.getString("texturePreloading", "core");
        if (!"core".equals(preload)) NativeApp.setSetting("EmuCore/GS", "texture_preloading", "int", preload);
        String aniso = s.getString("anisotropy", "core");
        if (!"core".equals(aniso)) NativeApp.setSetting("EmuCore/GS", "MaxAnisotropy", "int", aniso);

        Boolean fxaa = s.getBool("fxaa");
        NativeApp.setSetting("EmuCore/GS", "fxaa", "bool", fxaa != null && fxaa ? "true" : "false");

        // Nitidez adaptativa (CAS): 0 desliga; acima disso só afia a imagem.
        int sharpen = Math.max(0, Math.min(100, s.getInteger("sharpening", 0)));
        NativeApp.setSetting("EmuCore/GS", "CASMode", "int", sharpen > 0 ? "1" : "0");
        NativeApp.setSetting("EmuCore/GS", "CASSharpness", "int", String.valueOf(sharpen));

        // Realce de cores (ShadeBoost): suave ou vívido.
        String boost = s.getString("colorBoost", "off");
        boolean boostOn = "soft".equals(boost) || "vivid".equals(boost);
        NativeApp.setSetting("EmuCore/GS", "ShadeBoost", "bool", boostOn ? "true" : "false");
        if (boostOn) {
            boolean vivid = "vivid".equals(boost);
            NativeApp.setSetting("EmuCore/GS", "ShadeBoost_Brightness", "int", "50");
            NativeApp.setSetting("EmuCore/GS", "ShadeBoost_Contrast", "int", vivid ? "58" : "53");
            NativeApp.setSetting("EmuCore/GS", "ShadeBoost_Saturation", "int", vivid ? "68" : "58");
        }
    }

    private void applySettings(JSObject s, String biosName) {
        if (biosName != null && !biosName.isEmpty()) {
            NativeApp.setSetting("Filenames", "BIOS", "string", biosName);
        }
        boolean hacks = s.getBool("speedHacks") == null || s.getBool("speedHacks");
        boolean mtvu = s.getBool("mtvu") == null || s.getBool("mtvu");
        boolean fastCdvd = s.getBool("fastCdvd") != null && s.getBool("fastCdvd");
        boolean skipDup = s.getBool("skipDuplicateFrames") == null || s.getBool("skipDuplicateFrames");
        boolean vsync = s.getBool("vsync") != null && s.getBool("vsync");
        NativeApp.setSetting("EmuCore/Speedhacks", "vuThread", "bool", mtvu ? "true" : "false");
        NativeApp.setSetting("EmuCore/Speedhacks", "vu1Instant", "bool", hacks ? "true" : "false");
        NativeApp.setSetting("EmuCore/Speedhacks", "IntcStat", "bool", hacks ? "true" : "false");
        NativeApp.setSetting("EmuCore/Speedhacks", "WaitLoop", "bool", hacks ? "true" : "false");
        NativeApp.setSetting("EmuCore/Speedhacks", "vuFlagHack", "bool", hacks ? "true" : "false");
        NativeApp.setSetting("EmuCore/Speedhacks", "fastCDVD", "bool", fastCdvd ? "true" : "false");
        NativeApp.setSetting("EmuCore/GS", "SkipDuplicateFrames", "bool", skipDup ? "true" : "false");
        NativeApp.setSetting("EmuCore/GS", "VsyncEnable", "bool", vsync ? "true" : "false");
        applyImageSettings(s);
        applyDriver(s.getString("gpuDriver", null), s.getString("renderer", "vulkan"));
        NativeApp.commitSettings();
        String renderer = s.getString("renderer", "vulkan");
        if ("opengl".equals(renderer)) NativeApp.renderOpenGL();
        else if ("software".equals(renderer)) NativeApp.renderSoftware();
        else NativeApp.renderVulkan();
        float scale = 2f;
        try { scale = Float.parseFloat(s.getString("resolution", "2")); } catch (Exception ignored) {}
        NativeApp.renderUpscalemultiplier(scale);
        String aspect = s.getString("aspect", "4:3");
        NativeApp.setAspectRatio("stretch".equals(aspect) ? 0 : "16:9".equals(aspect) ? 3 : 2);
        NativeApp.setFrameSkip(s.getInteger("frameSkip", 0));
        NativeApp.setAudioVolume(s.getInteger("volume", 80));
        int ee = 0;
        try { ee = Integer.parseInt(s.getString("eeCycleRate", "0")); } catch (Exception ignored) {}
        NativeApp.speedhackEecyclerate(ee);
        Boolean vib = s.getBool("vibration");
        vibration = vib != null ? vib : true;
    }

    // ---- Drivers de GPU (Turnip / MaliSX2 / PanVK) via libadrenotools do núcleo ----

    private File driversDir() {
        return new File(getContext().getFilesDir(), "drivers");
    }

    private void applyDriver(String id, String renderer) {
        try {
            File dir = id == null || id.isEmpty() ? null : new File(driversDir(), id);
            String lib = dir != null ? readDriverLib(dir) : null;
            if (!"vulkan".equals(renderer) || lib == null || !new File(dir, lib).exists()) {
                NativeApp.setCustomVulkanDriver("", "", "", "");
                return;
            }
            File cache = new File(dir, "cache");
            cache.mkdirs();
            NativeApp.setCustomVulkanDriver(dir.getAbsolutePath() + "/", lib,
                    cache.getAbsolutePath() + "/", getContext().getApplicationInfo().nativeLibraryDir);
        } catch (Throwable t) {
            emitStatus("Driver ignorado: " + t.getMessage());
        }
    }

    private static String readJson(File f) throws Exception {
        try (InputStream in = new java.io.FileInputStream(f)) {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            copy(in, b);
            return b.toString("UTF-8");
        }
    }

    private static String readDriverLib(File dir) {
        try {
            File meta = new File(dir, "meta.json");
            if (meta.exists()) {
                String lib = new JSONObject(readJson(meta)).optString("libraryName", "");
                if (!lib.isEmpty() && new File(dir, lib).exists()) return lib;
            }
        } catch (Throwable ignored) {}
        File[] list = dir.listFiles();
        if (list != null) for (File f : list) if (f.getName().startsWith("libvulkan") && f.getName().endsWith(".so")) return f.getName();
        if (list != null) for (File f : list) if (f.getName().endsWith(".so")) return f.getName();
        return null;
    }

    private JSObject describeDriver(File dir) {
        JSObject o = new JSObject();
        o.put("id", dir.getName());
        String name = dir.getName();
        String version = "";
        try {
            File meta = new File(dir, "meta.json");
            if (meta.exists()) {
                JSONObject j = new JSONObject(readJson(meta));
                name = j.optString("name", name);
                version = j.optString("driverVersion", "");
            }
        } catch (Throwable ignored) {}
        o.put("name", name);
        o.put("version", version);
        return o;
    }

    @PluginMethod
    public void listDrivers(PluginCall call) {
        JSArray arr = new JSArray();
        File[] list = driversDir().listFiles();
        if (list != null) for (File d : list) if (d.isDirectory() && readDriverLib(d) != null) arr.put(describeDriver(d));
        JSObject o = new JSObject();
        o.put("drivers", arr);
        call.resolve(o);
    }

    @PluginMethod
    public void pickDriver(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(call, i, "onDriverPicked");
    }

    @ActivityCallback
    private void onDriverPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.resolve(new JSObject());
            return;
        }
        final Uri uri = data.getData();
        new Thread(() -> {
            File dir = null;
            try {
                String fname = displayName(uri);
                if (fname == null) fname = "driver";
                String id = fname.replaceAll("\\.(zip|so)$", "").replaceAll("[^A-Za-z0-9._-]", "_");
                dir = new File(driversDir(), id);
                deleteTree(dir);
                dir.mkdirs();
                try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new Exception("Não deu para abrir o arquivo.");
                    if (fname.toLowerCase().endsWith(".so")) {
                        try (OutputStream out = new FileOutputStream(new File(dir, fname))) { copy(in, out); }
                    } else {
                        try (ZipInputStream zip = new ZipInputStream(in)) {
                            ZipEntry e;
                            while ((e = zip.getNextEntry()) != null) {
                                if (e.isDirectory()) continue;
                                String n = new File(e.getName()).getName();
                                if (!(n.endsWith(".so") || n.equals("meta.json"))) continue;
                                try (OutputStream out = new FileOutputStream(new File(dir, n))) { copy(zip, out); }
                            }
                        }
                    }
                }
                if (readDriverLib(dir) == null) {
                    deleteTree(dir);
                    call.reject("Esse arquivo não tem um driver Vulkan (.so). Use o .zip do Turnip, MaliSX2 ou PanVK.");
                    return;
                }
                for (File f : dir.listFiles()) f.setReadable(true, false);
                call.resolve(describeDriver(dir));
            } catch (Throwable t) {
                if (dir != null) deleteTree(dir);
                call.reject("Não deu para instalar o driver: " + t.getMessage());
            }
        }, "driver-install").start();
    }

    @PluginMethod
    public void removeDriver(PluginCall call) {
        String id = call.getString("id", "");
        if (!id.isEmpty() && !id.contains("/")) deleteTree(new File(driversDir(), id));
        call.resolve();
    }

    private static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    @PluginMethod
    public void boot(PluginCall call) {
        final String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("Nenhum jogo escolhido.");
            return;
        }
        if (running) {
            call.reject("Já existe um jogo rodando.");
            return;
        }
        final JSObject settings = call.getObject("settings", new JSObject());
        final String biosName = call.getString("bios");
        try {
            ensureInit();
        } catch (Throwable t) {
            call.reject(t.getMessage());
            return;
        }
        surfaceLatch = new CountDownLatch(1);
        main.post(this::showSurface);
        running = true;
        userPaused = false;
        emitStatus("Iniciando…");
        emuThread = new Thread(() -> {
            try {
                surfaceLatch.await(5, TimeUnit.SECONDS);
                applySettings(settings, biosName);
                main.post(fpsTick);
                emitStatus("Rodando");
                boolean ok = NativeApp.runVMThread(uri);
                String err = ok ? null : NativeApp.getLastBootError();
                JSObject o = new JSObject();
                o.put("ok", ok);
                o.put("error", err != null && !err.isEmpty() ? err : null);
                emitStatus(ok ? "Jogo encerrado" : "Não abriu: " + (err != null && !err.isEmpty() ? err : "verifique a BIOS e a ISO"));
                notifyListeners("ended", o);
            } catch (Throwable t) {
                emitStatus("Erro: " + t.getMessage());
            } finally {
                running = false;
            }
        }, "nebula2-emu");
        emuThread.start();
        call.resolve();
    }

    private void emitStatus(String text) {
        JSObject o = new JSObject();
        o.put("text", text);
        notifyListeners("status", o);
    }

    private void showSurface() {
        Activity act = getActivity();
        WebView web = getBridge().getWebView();
        if (act == null || web == null) return;
        if (surfaceView == null) {
            surfaceView = new SurfaceView(act);
            surfaceView.getHolder().addCallback(new SurfaceHolder.Callback() {
                @Override public void surfaceCreated(SurfaceHolder holder) {
                    surfaceReady = true;
                    NativeApp.onNativeSurfaceCreated();
                }
                @Override public void surfaceChanged(SurfaceHolder holder, int format, int w, int h) {
                    NativeApp.onNativeSurfaceChanged(holder.getSurface(), w, h);
                    CountDownLatch l = surfaceLatch;
                    if (l != null) l.countDown();
                }
                @Override public void surfaceDestroyed(SurfaceHolder holder) {
                    surfaceReady = false;
                    NativeApp.onNativeSurfaceDestroyed();
                }
            });
        }
        if (surfaceView.getParent() == null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            parent.addView(surfaceView, 0, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        web.setBackgroundColor(Color.TRANSPARENT);
        act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        act.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        setImmersive(act, true);
    }

    @SuppressWarnings("deprecation")
    private static void setImmersive(Activity act, boolean on) {
        if (Build.VERSION.SDK_INT >= 28) {
            act.getWindow().getAttributes().layoutInDisplayCutoutMode = on
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
        }
        if (Build.VERSION.SDK_INT >= 30) {
            act.getWindow().setDecorFitsSystemWindows(!on);
            WindowInsetsController c = act.getWindow().getInsetsController();
            if (c == null) return;
            if (on) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            } else {
                c.show(WindowInsets.Type.systemBars());
            }
        } else {
            View d = act.getWindow().getDecorView();
            d.setSystemUiVisibility(on
                    ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                      | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                      | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    : View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    private void hideSurface() {
        Activity act = getActivity();
        WebView web = getBridge().getWebView();
        if (surfaceView != null && surfaceView.getParent() != null) {
            ((ViewGroup) surfaceView.getParent()).removeView(surfaceView);
        }
        if (web != null) web.setBackgroundColor(Color.parseColor("#0a1020"));
        if (act != null) {
            act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            act.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            setImmersive(act, false);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.removeCallbacks(fpsTick);
        new Thread(() -> {
            try {
                if (NativeApp.loaded && (running || NativeApp.hasActiveVM())) NativeApp.shutdown();
                Thread t = emuThread;
                if (t != null) t.join(3000);
            } catch (Throwable ignored) {
            } finally {
                emuThread = null;
                running = false;
                main.post(this::hideSurface);
                call.resolve();
            }
        }, "nebula2-stop").start();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        userPaused = true;
        if (running) NativeApp.pause();
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        userPaused = false;
        if (running) NativeApp.resume();
        call.resolve();
    }

    @PluginMethod
    public void saveState(PluginCall call) {
        final int slot = call.getInt("slot", 1);
        new Thread(() -> {
            boolean ok = running && NativeApp.saveStateToSlot(slot);
            if (ok) call.resolve(); else call.reject("Não deu para salvar no slot " + slot + ".");
        }, "nebula2-save").start();
    }

    @PluginMethod
    public void loadState(PluginCall call) {
        final int slot = call.getInt("slot", 1);
        new Thread(() -> {
            boolean ok = running && NativeApp.loadStateFromSlot(slot);
            if (ok) call.resolve(); else call.reject("O slot " + slot + " está vazio.");
        }, "nebula2-load").start();
    }

    @PluginMethod
    public void setButton(PluginCall call) {
        int key = call.getInt("key", -1);
        boolean pressed = call.getBoolean("pressed", false);
        if (running && key >= 0) NativeApp.setPadButton(key, 0, pressed);
        call.resolve();
    }

    @PluginMethod
    public void setAnalog(PluginCall call) {
        boolean left = !"right".equals(call.getString("stick", "left"));
        double x = call.getDouble("x", 0.0);
        double y = call.getDouble("y", 0.0);
        if (running) sendStick(left, (float) x, (float) y);
        call.resolve();
    }

    private static void sendAxis(int negKey, int posKey, float v) {
        final float dead = 0.08f;
        int range = (int) Math.min(32767, Math.abs(v) * 32767);
        if (v > dead) {
            NativeApp.setPadButton(negKey, 0, false);
            NativeApp.setPadButton(posKey, range, true);
        } else if (v < -dead) {
            NativeApp.setPadButton(posKey, 0, false);
            NativeApp.setPadButton(negKey, range, true);
        } else {
            NativeApp.setPadButton(negKey, 0, false);
            NativeApp.setPadButton(posKey, 0, false);
        }
    }

    private static void sendStick(boolean left, float x, float y) {
        if (left) {
            sendAxis(113, 111, x);
            sendAxis(110, 112, y);
        } else {
            sendAxis(123, 121, x);
            sendAxis(120, 122, y);
        }
    }

    static boolean handleKey(KeyEvent e) {
        Ps2CorePlugin p = sInstance;
        if (p == null || !p.running) return false;
        int src = e.getSource();
        boolean pad = (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
                || (src & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD;
        if (!pad) return false;
        int k = e.getKeyCode();
        boolean known = (k >= 19 && k <= 22) || (k >= 96 && k <= 109 && k != 98 && k != 101);
        if (!known) return false;
        if (e.getRepeatCount() == 0) {
            NativeApp.setPadButton(k, 0, e.getAction() == KeyEvent.ACTION_DOWN);
        }
        return true;
    }

    static boolean handleMotion(MotionEvent e) {
        Ps2CorePlugin p = sInstance;
        if (p == null || !p.running) return false;
        if ((e.getSource() & InputDevice.SOURCE_JOYSTICK) != InputDevice.SOURCE_JOYSTICK) return false;
        sendStick(true, e.getAxisValue(MotionEvent.AXIS_X), e.getAxisValue(MotionEvent.AXIS_Y));
        sendStick(false, e.getAxisValue(MotionEvent.AXIS_Z), e.getAxisValue(MotionEvent.AXIS_RZ));
        float hx = e.getAxisValue(MotionEvent.AXIS_HAT_X);
        float hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
        NativeApp.setPadButton(21, 0, hx < -0.5f);
        NativeApp.setPadButton(22, 0, hx > 0.5f);
        NativeApp.setPadButton(19, 0, hy < -0.5f);
        NativeApp.setPadButton(20, 0, hy > 0.5f);
        float lt = Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE));
        float rt = Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS));
        NativeApp.setPadButton(104, 0, lt > 0.5f);
        NativeApp.setPadButton(105, 0, rt > 0.5f);
        return true;
    }

    private void rumble(int pad, int large, int small) {
        if (!vibration || pad != 0) return;
        Context ctx = getContext();
        if (ctx == null) return;
        Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        int amp = Math.min(255, (int) (0.6f * large + 0.4f * small));
        if (amp <= 0) {
            v.cancel();
        } else if (android.os.Build.VERSION.SDK_INT >= 26) {
            v.vibrate(VibrationEffect.createOneShot(3000, Math.max(1, amp)));
        }
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (running) {
            try { NativeApp.pause(); NativeApp.flushShaderCache(); } catch (Throwable ignored) {}
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (running && !userPaused) {
            try { NativeApp.resume(); } catch (Throwable ignored) {}
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (running) {
            try { NativeApp.shutdown(); } catch (Throwable ignored) {}
        }
        super.handleOnDestroy();
    }
}
