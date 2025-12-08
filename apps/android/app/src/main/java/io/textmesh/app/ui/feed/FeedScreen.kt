// =================================
// FEED SCREEN
// =================================

package io.textmesh.app.ui.feed

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import io.textmesh.app.ui.components.PostCard

enum class FeedType { HOME, DISCOVER }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    viewModel: FeedViewModel = hiltViewModel()
) {
    val feedState by viewModel.feedState.collectAsState()
    var selectedFeed by remember { mutableStateOf(FeedType.HOME) }
    val listState = rememberLazyListState()

    LaunchedEffect(selectedFeed) {
        viewModel.loadFeed(selectedFeed)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Top bar
        CenterAlignedTopAppBar(
            title = { Text("TextMesh") }
        )

        // Feed type selector
        TabRow(selectedTabIndex = selectedFeed.ordinal) {
            Tab(
                selected = selectedFeed == FeedType.HOME,
                onClick = { selectedFeed = FeedType.HOME },
                text = { Text("Following") }
            )
            Tab(
                selected = selectedFeed == FeedType.DISCOVER,
                onClick = { selectedFeed = FeedType.DISCOVER },
                text = { Text("Discover") }
            )
        }

        Box(modifier = Modifier.fillMaxSize()) {
            when {
                feedState.isLoading && feedState.posts.isEmpty() -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                feedState.error != null && feedState.posts.isEmpty() -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = feedState.error ?: "An error occurred",
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { viewModel.loadFeed(selectedFeed) }) {
                            Text("Retry")
                        }
                    }
                }
                feedState.posts.isEmpty() -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = if (selectedFeed == FeedType.HOME) {
                                "Follow people to see their posts here"
                            } else {
                                "Discover trending posts"
                            },
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                else -> {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(
                            items = feedState.posts,
                            key = { it.id }
                        ) { post ->
                            PostCard(
                                post = post,
                                onLikeClick = { viewModel.toggleLike(post.id) },
                                onRepostClick = { viewModel.toggleRepost(post.id) },
                                onBookmarkClick = { viewModel.toggleBookmark(post.id) },
                                onPostClick = { /* Navigate to post detail */ },
                                onUserClick = { /* Navigate to user profile */ }
                            )
                            HorizontalDivider()
                        }

                        if (feedState.hasMore) {
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
                                    viewModel.loadMore(selectedFeed)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
