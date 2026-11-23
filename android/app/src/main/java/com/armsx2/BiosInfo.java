package com.armsx2;

/**
 * BIOS details built by the ARMSX2 core (native-lib.cpp, getBiosInfoFromFd).
 * The core looks this class up by name and calls the (IILjava/lang/String;Ljava/lang/String;)V
 * constructor, so keep the package, name and constructor exactly like this.
 * From ARMSX2 (GPL-3.0-or-later), rewritten in Java.
 */
public class BiosInfo {
    public final int version;
    public final int region;
    public final String description;
    public final String zone;

    public BiosInfo(int version, int region, String description, String zone) {
        this.version = version;
        this.region = region;
        this.description = description;
        this.zone = zone;
    }

    public String versionString() {
        return String.format(java.util.Locale.ROOT, "v%d.%02d", (version >> 8) & 0xFF, version & 0xFF);
    }
}
