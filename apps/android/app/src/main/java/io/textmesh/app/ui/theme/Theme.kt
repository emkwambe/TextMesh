// =================================
// TEXTMESH THEME
// =================================

package io.textmesh.app.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// Colors
val Primary = Color(0xFF1DA1F2)
val PrimaryDark = Color(0xFF1A8CD8)
val Secondary = Color(0xFF657786)
val Background = Color(0xFFF7F9FA)
val Surface = Color(0xFFFFFFFF)
val Error = Color(0xFFE0245E)
val OnPrimary = Color.White
val OnSecondary = Color.White
val OnBackground = Color(0xFF14171A)
val OnSurface = Color(0xFF14171A)
val OnError = Color.White

// Dark Colors
val DarkBackground = Color(0xFF15202B)
val DarkSurface = Color(0xFF192734)
val DarkOnBackground = Color(0xFFD9D9D9)
val DarkOnSurface = Color(0xFFD9D9D9)

private val LightColorScheme = lightColorScheme(
    primary = Primary,
    onPrimary = OnPrimary,
    primaryContainer = Primary.copy(alpha = 0.1f),
    onPrimaryContainer = Primary,
    secondary = Secondary,
    onSecondary = OnSecondary,
    secondaryContainer = Secondary.copy(alpha = 0.1f),
    onSecondaryContainer = Secondary,
    tertiary = Primary,
    onTertiary = OnPrimary,
    background = Background,
    onBackground = OnBackground,
    surface = Surface,
    onSurface = OnSurface,
    surfaceVariant = Color(0xFFF0F3F5),
    onSurfaceVariant = Secondary,
    error = Error,
    onError = OnError,
    errorContainer = Error.copy(alpha = 0.1f),
    onErrorContainer = Error,
    outline = Color(0xFFCCD6DD)
)

private val DarkColorScheme = darkColorScheme(
    primary = Primary,
    onPrimary = OnPrimary,
    primaryContainer = Primary.copy(alpha = 0.2f),
    onPrimaryContainer = Primary,
    secondary = Secondary,
    onSecondary = OnSecondary,
    secondaryContainer = Secondary.copy(alpha = 0.2f),
    onSecondaryContainer = Color(0xFFAAB8C2),
    tertiary = Primary,
    onTertiary = OnPrimary,
    background = DarkBackground,
    onBackground = DarkOnBackground,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = Color(0xFF22303C),
    onSurfaceVariant = Color(0xFF8899A6),
    error = Error,
    onError = OnError,
    errorContainer = Error.copy(alpha = 0.2f),
    onErrorContainer = Error,
    outline = Color(0xFF38444D)
)

@Composable
fun TextMeshTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}

// Typography
val Typography = Typography()
