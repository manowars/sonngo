package com.sonngo.linknotes;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

/**
 * Receives Android "Share to…" intents and hands the shared text to the web
 * app. The WebView may still be loading on a cold start, so each payload is
 * delivered several times with a stable token; the JS side de-duplicates by
 * that token.
 */
public class MainActivity extends BridgeActivity {

    private static final long[] DELIVERY_DELAYS_MS = { 300, 1200, 3000, 6000 };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShare(intent);
    }

    private void handleShare(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_VIEW.equals(action)) return;

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null && intent.getData() != null) text = intent.getData().toString();
        if (text == null || text.trim().isEmpty()) return;

        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject == null) subject = "";
        String token = Integer.toHexString((text + "|" + subject).hashCode()) + "-" + System.currentTimeMillis();

        final String script = "window.__linknotesShare("
                + JSONObject.quote(text) + ","
                + JSONObject.quote(subject) + ","
                + JSONObject.quote(token) + ")";

        Handler handler = new Handler(Looper.getMainLooper());
        for (long delay : DELIVERY_DELAYS_MS) {
            handler.postDelayed(() -> {
                if (getBridge() == null) return;
                WebView webView = getBridge().getWebView();
                if (webView != null) webView.evaluateJavascript(script, null);
            }, delay);
        }
    }
}
