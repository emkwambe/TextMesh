// =================================
// MAIN ACTIVITY
// =================================

package io.textmesh.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import dagger.hilt.android.AndroidEntryPoint
import io.textmesh.app.ui.auth.AuthScreen
import io.textmesh.app.ui.auth.AuthViewModel
import io.textmesh.app.ui.MainScreen
import io.textmesh.app.ui.theme.TextMeshTheme

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            TextMeshTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val authViewModel: AuthViewModel = hiltViewModel()
                    val authState by authViewModel.authState.collectAsState()

                    if (authState.isAuthenticated) {
                        MainScreen()
                    } else {
                        AuthScreen(
                            onLoginSuccess = { authViewModel.checkAuthState() }
                        )
                    }
                }
            }
        }
    }
}
