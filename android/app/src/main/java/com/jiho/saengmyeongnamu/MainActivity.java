package com.jiho.saengmyeongnamu;

import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.view.View;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 처음에는 기기 다크 모드 설정에 맞춰 상태 표시줄·내비게이션 바 아이콘 색을 정함
        setBarsDark(isSystemDark());
        // 웹 화면(설정 > 화면 모드)에서 실제 적용된 밝기를 알려 주면 아이콘 색을 맞춤
        getBridge().getWebView().addJavascriptInterface(new ThemeBridge(), "AndroidTheme");
        // 화면 전체를 쓰는 레이아웃에서도 키보드가 올라오면 웹 화면을 그 높이만큼 줄여 팝업이 가려지지 않게 함
        final View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(0, 0, 0, ime.bottom);
            return insets;
        });
        // 뒤로 가기(화면 가장자리 스와이프 제스처·뒤로 버튼): 앱 안의 이전 화면/팝업 닫기로 처리하고,
        // 더 돌아갈 곳이 없을 때만(홈 화면) 기본 동작으로 앱을 닫음
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final OnBackPressedCallback self = this;
                getBridge().getWebView().evaluateJavascript(
                    "(function(){try{return !!(window.__appBack&&window.__appBack())}catch(e){return false}})()",
                    result -> {
                        if (!"true".equals(result)) {
                            self.setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                            self.setEnabled(true);
                        }
                    });
            }
        });
    }

    private boolean isSystemDark() {
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    private void setBarsDark(boolean dark) {
        WindowInsetsControllerCompat c =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        // 어두운 배경이면 밝은 아이콘, 밝은 배경이면 어두운 아이콘
        c.setAppearanceLightStatusBars(!dark);
        c.setAppearanceLightNavigationBars(!dark);
    }

    private class ThemeBridge {
        @JavascriptInterface
        public void setDark(final boolean dark) {
            runOnUiThread(() -> setBarsDark(dark));
        }
    }
}
