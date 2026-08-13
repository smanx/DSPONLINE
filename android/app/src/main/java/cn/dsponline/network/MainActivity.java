package cn.dsponline.network;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureSessionPlugin.class);
        registerPlugin(AccountArchivePlugin.class);
        registerPlugin(TextExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
