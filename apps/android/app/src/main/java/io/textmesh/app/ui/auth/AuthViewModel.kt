// =================================
// AUTH VIEW MODEL
// =================================

package io.textmesh.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.textmesh.app.data.api.ApiService
import io.textmesh.app.data.models.LoginRequest
import io.textmesh.app.data.models.RegisterRequest
import io.textmesh.app.data.models.User
import io.textmesh.app.data.repository.TokenRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class AuthState(
    val isLoading: Boolean = false,
    val isAuthenticated: Boolean = false,
    val currentUser: User? = null,
    val error: String? = null
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val apiService: ApiService,
    private val tokenRepository: TokenRepository
) : ViewModel() {

    private val _authState = MutableStateFlow(AuthState())
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    init {
        checkAuthState()
    }

    fun checkAuthState() {
        viewModelScope.launch {
            tokenRepository.isLoggedIn.collect { isLoggedIn ->
                if (isLoggedIn) {
                    fetchCurrentUser()
                } else {
                    _authState.update { it.copy(isAuthenticated = false, currentUser = null) }
                }
            }
        }
    }

    private suspend fun fetchCurrentUser() {
        try {
            val response = apiService.getCurrentUser()
            _authState.update {
                it.copy(
                    isAuthenticated = true,
                    currentUser = response.data,
                    error = null
                )
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to fetch current user")
            tokenRepository.clearTokens()
            _authState.update {
                it.copy(isAuthenticated = false, currentUser = null)
            }
        }
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _authState.update { it.copy(isLoading = true, error = null) }

            try {
                val response = apiService.login(LoginRequest(email, password))
                tokenRepository.saveTokens(
                    response.data.accessToken,
                    response.data.refreshToken
                )
                _authState.update {
                    it.copy(
                        isLoading = false,
                        isAuthenticated = true,
                        currentUser = response.data.user,
                        error = null
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Login failed")
                _authState.update {
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Login failed"
                    )
                }
            }
        }
    }

    fun register(username: String, email: String, password: String, dateOfBirth: String) {
        viewModelScope.launch {
            _authState.update { it.copy(isLoading = true, error = null) }

            try {
                val response = apiService.register(
                    RegisterRequest(username, email, password, dateOfBirth)
                )
                tokenRepository.saveTokens(
                    response.data.accessToken,
                    response.data.refreshToken
                )
                _authState.update {
                    it.copy(
                        isLoading = false,
                        isAuthenticated = true,
                        currentUser = response.data.user,
                        error = null
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Registration failed")
                _authState.update {
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Registration failed"
                    )
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            try {
                apiService.logout()
            } catch (e: Exception) {
                Timber.e(e, "Logout API call failed")
            } finally {
                tokenRepository.clearTokens()
                _authState.update {
                    AuthState(isAuthenticated = false)
                }
            }
        }
    }

    fun clearError() {
        _authState.update { it.copy(error = null) }
    }
}
