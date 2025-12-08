// =================================
// NOTIFICATIONS SCREEN
// =================================

package io.textmesh.app.ui.notifications

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import io.textmesh.app.data.models.AppNotification
import io.textmesh.app.data.models.NotificationType

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    viewModel: NotificationsViewModel = hiltViewModel()
) {
    val notificationsState by viewModel.notificationsState.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadNotifications()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notifications") },
                actions = {
                    IconButton(onClick = { viewModel.markAllAsRead() }) {
                        Icon(Icons.Default.DoneAll, contentDescription = "Mark all as read")
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                notificationsState.isLoading && notificationsState.notifications.isEmpty() -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                notificationsState.notifications.isEmpty() -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.NotificationsOff,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "No notifications yet",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                else -> {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(
                            items = notificationsState.notifications,
                            key = { it.id }
                        ) { notification ->
                            NotificationItem(
                                notification = notification,
                                onClick = { viewModel.markAsRead(notification.id) }
                            )
                            HorizontalDivider()
                        }

                        if (notificationsState.hasMore) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator()
                                }

                                LaunchedEffect(Unit) {
                                    viewModel.loadMore()
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationItem(
    notification: AppNotification,
    onClick: () -> Unit
) {
    val backgroundColor = if (!notification.isRead) {
        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.1f)
    } else {
        MaterialTheme.colorScheme.surface
    }

    ListItem(
        modifier = Modifier.fillMaxWidth(),
        colors = ListItemDefaults.colors(containerColor = backgroundColor),
        leadingContent = {
            Box {
                AsyncImage(
                    model = notification.actor.avatarUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop
                )

                // Notification type icon
                Icon(
                    imageVector = notification.type.icon,
                    contentDescription = null,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(20.dp),
                    tint = notification.type.color
                )
            }
        },
        headlineContent = {
            Text("${notification.actor.resolvedDisplayName} ${notification.type.message}")
        },
        supportingContent = {
            Text(
                text = notification.createdAt,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        trailingContent = {
            if (!notification.isRead) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.primary
                    ) {}
                }
            }
        }
    )
}

private val NotificationType.icon: androidx.compose.ui.graphics.vector.ImageVector
    get() = when (this) {
        NotificationType.FOLLOW -> Icons.Default.PersonAdd
        NotificationType.LIKE -> Icons.Default.Favorite
        NotificationType.REPLY -> Icons.Default.Reply
        NotificationType.MENTION -> Icons.Default.AlternateEmail
        NotificationType.REPOST -> Icons.Default.Repeat
        NotificationType.GROUP_INVITE -> Icons.Default.Group
    }

private val NotificationType.color: Color
    get() = when (this) {
        NotificationType.LIKE -> Color(0xFFE0245E)
        NotificationType.FOLLOW -> Color(0xFF1DA1F2)
        NotificationType.REPOST -> Color(0xFF17BF63)
        NotificationType.MENTION -> Color(0xFF794BC4)
        NotificationType.REPLY -> Color(0xFF1DA1F2)
        NotificationType.GROUP_INVITE -> Color(0xFFFFAD1F)
    }

private val NotificationType.message: String
    get() = when (this) {
        NotificationType.FOLLOW -> "followed you"
        NotificationType.LIKE -> "liked your post"
        NotificationType.REPLY -> "replied to your post"
        NotificationType.MENTION -> "mentioned you"
        NotificationType.REPOST -> "reposted your post"
        NotificationType.GROUP_INVITE -> "invited you to a group"
    }
