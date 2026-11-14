package com.jiho.saengmyeongnamu;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 밝은 배경에 맞춰 상태 표시줄·내비게이션 바 아이콘을 어두운 색으로 표시
        WindowInsetsControllerCompat c =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(true);
        c.setAppearanceLightNavigationBars(true);
    }
}
