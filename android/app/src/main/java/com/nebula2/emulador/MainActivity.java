package com.nebula2.emulador;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Ps2CorePlugin.class);
        super.onCreate(savedInstanceState);
    }

    // Physical controllers go straight to the core while a game runs.
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (Ps2CorePlugin.handleKey(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (Ps2CorePlugin.handleMotion(event)) return true;
        return super.dispatchGenericMotionEvent(event);
    }
}
