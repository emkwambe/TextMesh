// =================================
// NOTIFICATIONS VIEW MODEL
// =================================

package io.textmesh.app.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.textmesh.app.data.api.ApiService
import io.textmesh.app.data.models.AppNotification
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class NotificationsState(
    val notifications: List<AppNotification> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = true,
    val unreadCount: Int = 0,
    val cursor: String? = null
)

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _notificationsState = MutableStateFlow(NotificationsState())
    val notificationsState: StateFlow<NotificationsState> = _notificationsState.asStateFlow()

    fun loadNotifications() {
        viewModelScope.launch {
            _notificationsState.update { it.copy(isLoading = true) }

            try {
                val response = apiService.getNotifications()

                _notificationsState.update {
                    it.copy(
                        notifications = response.data.items,
                        isLoading = false,
                        hasMore = response.data.hasMore,
                        unreadCount = response.data.unreadCount,
                        cursor = response.data.nextCursor
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to load notifications")
                _notificationsState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun loadMore() {
        val currentState = _notificationsState.value
        if (!currentState.hasMore || currentState.isLoadingMore || currentState.cursor == null) return

        viewModelScope.launch {
            _notificationsState.update { it.copy(isLoadingMore = true) }

            try {
                val response = apiService.getNotifications(cursor = currentState.cursor)

                _notificationsState.update {
                    it.copy(
                        notifications = it.notifications + response.data.items,
                        isLoadingMore = false,
                        hasMore = response.data.hasMore,
                        cursor = response.data.nextCursor
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to load more notifications")
                _notificationsState.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun markAsRead(notificationId: String) {
        viewModelScope.launch {
            // Optimistic update
            _notificationsState.update { state ->
                state.copy(
                    notifications = state.notifications.map {
                        if (it.id == notificationId) it.copy(isRead = true) else it
                    },
                    unreadCount = (state.unreadCount - 1).coerceAtLeast(0)
                )
            }

            try {
                apiService.markNotificationsRead(mapOf("notificationIds" to listOf(notificationId)))
            } catch (e: Exception) {
                Timber.e(e, "Failed to mark notification as read")
            }
        }
    }

    fun markAllAsRead() {
        viewModelScope.launch {
            // Optimistic update
            _notificationsState.update { state ->
                state.copy(
                    notifications = state.notifications.map { it.copy(isRead = true) },
                    unreadCount = 0
                )
            }

            try {
                apiService.markNotificationsRead(mapOf("all" to true))
            } catch (e: Exception) {
                Timber.e(e, "Failed to mark all notifications as read")
            }
        }
    }
}
