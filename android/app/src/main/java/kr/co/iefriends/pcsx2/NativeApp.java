package kr.co.iefriends.pcsx2;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.system.OsConstants;
import android.view.Surface;

import com.armsx2.BiosInfo;

import java.io.File;
import java.lang.ref.WeakReference;

/**
 * Bridge to the ARMSX2 core (libemucore_*.so, downloaded by scripts/fetch-armsx2-core.sh).
 *
 * The core's native functions are named after this exact class
 * (Java_kr_co_iefriends_pcsx2_NativeApp_*), and the core calls back into the static
 * methods at the bottom by name and signature. Do not rename the package, the class,
 * or those callbacks. Only the natives NEBULA·2 uses are declared; JNI binds each one
 * the first time it is called, so the others can stay out.
 *
 * Trimmed from ARMSX2's NativeApp.java (GPL-3.0-or-later).
 */
public final class NativeApp {
    public static final boolean loaded;
    public static final String loadError;

    static {
        String name = pageSize() >= 16384 ? "emucore_16k" : "emucore_4k";
        boolean ok;
        String err = null;
        try {
            System.loadLibrary(name);
            ok = true;
        } catch (Throwable t) {
            ok = false;
            err = t.getMessage();
        }
        loaded = ok;
        loadError = err;
    }

    private NativeApp() {}

    private static long pageSize() {
        try {
            long size = Os.sysconf(OsConstants._SC_PAGESIZE);
            return size > 0 ? size : 4096;
        } catch (Throwable ignored) {
            return 4096;
        }
    }

    private static WeakReference<Context> sContext;

    public static Context getContext() {
        return sContext != null ? sContext.get() : null;
    }

    /** Sets the data folder (resources, memory cards, saves) and the BIOS folder. */
    public static void initializeOnce(Context context, String dataPath, String biosFolder) {
        sContext = new WeakReference<>(context.getApplicationContext());
        initialize(dataPath, biosFolder, android.os.Build.VERSION.SDK_INT);
    }

    // ---- Natives used by NEBULA·2 ----
    public static native void initialize(String path, String biosFolder, int apiVer);
    public static native void setSetting(String section, String key, String type, String value);
    public static native void commitSettings();
    public static native void setCustomVulkanDriver(String driverDir, String driverName, String redirectDir, String hookLibDir);
    public static native String getLastBootError();
    public static native float getFPS();
    public static native void setPadButton(int index, int range, boolean pressed);
    public static native void resetKeyStatus();
    public static native void setAspectRatio(int type);
    public static native void setFrameSkip(int skip);
    public static native void setAudioVolume(int volume);
    public static native void speedhackEecyclerate(int value);
    public static native void renderUpscalemultiplier(float value);
    public static native void renderSoftware();
    public static native void renderOpenGL();
    public static native void renderVulkan();
    public static native void onNativeSurfaceCreated();
    public static native void onNativeSurfaceChanged(Surface surface, int w, int h);
    public static native void onNativeSurfaceDestroyed();
    public static native boolean runVMThread(String path);
    public static native void pause();
    public static native void resume();
    public static native void shutdown();
    public static native boolean hasActiveVM();
    public static native void flushShaderCache();
    public static native BiosInfo getBiosInfoFromFd(int fd);
    public static native boolean saveStateToSlot(int slot);
    public static native boolean loadStateFromSlot(int slot);

    // ---- Called by the core. Names and signatures must match native-lib.cpp. ----

    /** Listener for pause/resume coming from inside the core. */
    public interface PauseListener { void onPaused(boolean paused); }
    public static volatile PauseListener pauseListener;

    /** (Z)V */
    public static void vmSetPaused(boolean paused) {
        PauseListener l = pauseListener;
        if (l == null) return;
        try { l.onPaused(paused); } catch (Throwable ignored) {}
    }

    /** Listener for controller rumble (motors 0..255). */
    public interface RumbleListener { void onRumble(int pad, int large, int small); }
    public static volatile RumbleListener rumbleListener;

    /** (III)V — called with no exception check, so nothing may escape. */
    public static void onPadRumble(int pad, int largeMotor, int smallMotor) {
        RumbleListener l = rumbleListener;
        if (l == null) return;
        try { l.onRumble(pad, largeMotor, smallMotor); } catch (Throwable ignored) {}
    }

    /** (Ljava/lang/String;)V — achievement sounds; not used. */
    public static void playSound(String path) {}

    /** (Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V — not used. */
    public static void onAutoTuneCommitted(String serial, String section, String key, String value) {}

    /** (I)V — not used. */
    public static void onAutoTuneDisplayScale(int value) {}

    /** (Ljava/lang/String;)[Ljava/lang/String; — other discs of a multi-file CHD. */
    public static String[] findSiblingChds(String uriString) {
        Context context = getContext();
        if (context == null) return new String[0];
        try {
            return ContentChdFiles.findSiblings(context.getContentResolver(), Uri.parse(uriString));
        } catch (Throwable t) {
            return new String[0];
        }
    }

    /** (Ljava/lang/String;)I — opens a content:// game file for the core and hands over the fd. */
    public static int openContentUri(String uriString) {
        Context context = getContext();
        if (context == null) return -1;
        try {
            ContentResolver resolver = context.getContentResolver();
            ParcelFileDescriptor pfd = resolver.openFileDescriptor(Uri.parse(uriString), "r");
            if (pfd != null) return pfd.detachFd();
        } catch (Throwable ignored) {}
        return -1;
    }

    /** (Ljava/lang/String;)Z */
    public static boolean createDirectoryPath(String path) {
        if (path == null || path.isEmpty()) return false;
        try {
            File dir = new File(path);
            if (dir.isDirectory()) return true;
            dir.mkdirs();
            return dir.isDirectory();
        } catch (Throwable t) {
            return false;
        }
    }

    /** (Ljava/lang/String;)Z */
    public static boolean createFilePath(String path) {
        if (path == null || path.isEmpty()) return false;
        try {
            File file = new File(path);
            if (file.isFile()) return true;
            File parent = file.getParentFile();
            if (parent != null && !parent.isDirectory()) parent.mkdirs();
            return file.createNewFile() || file.isFile();
        } catch (Throwable t) {
            return false;
        }
    }
}
