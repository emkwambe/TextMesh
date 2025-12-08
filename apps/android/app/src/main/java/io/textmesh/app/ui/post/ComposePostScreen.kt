// =================================
// COMPOSE POST SCREEN
// =================================

package io.textmesh.app.ui.post

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import io.textmesh.app.data.models.PostVisibility
import io.textmesh.app.ui.auth.AuthViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComposePostScreen(
    onDismiss: () -> Unit,
    onPostCreated: () -> Unit,
    replyToPostId: String? = null,
    viewModel: ComposePostViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel()
) {
    val composeState by viewModel.composeState.collectAsState()
    val authState by authViewModel.authState.collectAsState()
    var content by remember { mutableStateOf("") }
    var visibility by remember { mutableStateOf(PostVisibility.PUBLIC) }
    var showVisibilityMenu by remember { mutableStateOf(false) }

    LaunchedEffect(composeState.isSuccess) {
        if (composeState.isSuccess) {
            onPostCreated()
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = onDismiss) {
                    Text("Cancel")
                }

                Button(
                    onClick = {
                        viewModel.createPost(
                            content = content,
                            visibility = visibility,
                            parentId = replyToPostId
                        )
                    },
                    enabled = content.isNotBlank() && content.length <= 500 && !composeState.isLoading
                ) {
                    if (composeState.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                    } else {
                        Text("Post")
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Compose area
            Row(modifier = Modifier.fillMaxWidth()) {
                // Avatar
                AsyncImage(
                    model = authState.currentUser?.avatarUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop
                )

                Spacer(modifier = Modifier.width(12.dp))

                // Text field
                OutlinedTextField(
                    value = content,
                    onValueChange = { if (it.length <= 500) content = it },
                    placeholder = { Text("What's happening?") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 4,
                    maxLines = 10,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MaterialTheme.colorScheme.background,
                        unfocusedBorderColor = MaterialTheme.colorScheme.background
                    )
                )
            }

            // Error message
            composeState.error?.let { error ->
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            HorizontalDivider()

            // Bottom toolbar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Visibility selector
                Box {
                    TextButton(onClick = { showVisibilityMenu = true }) {
                        Icon(
                            imageVector = when (visibility) {
                                PostVisibility.PUBLIC -> Icons.Default.Public
                                PostVisibility.FOLLOWERS -> Icons.Default.Group
                                PostVisibility.PRIVATE -> Icons.Default.Lock
                            },
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = when (visibility) {
                                PostVisibility.PUBLIC -> "Everyone"
                                PostVisibility.FOLLOWERS -> "Followers"
                                PostVisibility.PRIVATE -> "Only me"
                            }
                        )
                    }

                    DropdownMenu(
                        expanded = showVisibilityMenu,
                        onDismissRequest = { showVisibilityMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("Everyone") },
                            leadingIcon = { Icon(Icons.Default.Public, null) },
                            onClick = {
                                visibility = PostVisibility.PUBLIC
                                showVisibilityMenu = false
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Followers") },
                            leadingIcon = { Icon(Icons.Default.Group, null) },
                            onClick = {
                                visibility = PostVisibility.FOLLOWERS
                                showVisibilityMenu = false
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Only me") },
                            leadingIcon = { Icon(Icons.Default.Lock, null) },
                            onClick = {
                                visibility = PostVisibility.PRIVATE
                                showVisibilityMenu = false
                            }
                        )
                    }
                }

                // Character count
                Text(
                    text = "${500 - content.length}",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (content.length > 500) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    }
                )
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}
