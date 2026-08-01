package com.confrontaoroscopo.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Pin the WebView's text zoom so rem/em-based CSS doesn't scale with
        // the device's system font-size accessibility setting.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
