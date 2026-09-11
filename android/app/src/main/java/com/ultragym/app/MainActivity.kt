package com.ultragym.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.ultragym.app.timer.WorkoutRestTimerPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WorkoutRestTimerPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
