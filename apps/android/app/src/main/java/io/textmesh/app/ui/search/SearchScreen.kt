// =================================
// SEARCH SCREEN
// =================================

package io.textmesh.app.ui.search

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import io.textmesh.app.ui.components.PostCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    viewModel: SearchViewModel = hiltViewModel()
) {
    val searchState by viewModel.searchState.collectAsState()
    var searchQuery by remember { mutableStateOf("") }
    var isSearchActive by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        SearchBar(
            query = searchQuery,
            onQueryChange = { searchQuery = it },
            onSearch = { viewModel.search(searchQuery) },
            active = isSearchActive,
            onActiveChange = { isSearchActive = it },
            placeholder = { Text("Search users, posts, groups...") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = if (isSearchActive) 0.dp else 16.dp)
        ) {
            when {
                searchState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                searchQuery.length < 2 -> {
                    // Show trending when not searching
                    TrendingSection(viewModel = viewModel)
                }
                else -> {
                    SearchResults(searchState = searchState, viewModel = viewModel)
                }
            }
        }

        if (!isSearchActive) {
            TrendingSection(viewModel = viewModel)
        }
    }
}

@Composable
private fun TrendingSection(viewModel: SearchViewModel) {
    val trendingState by viewModel.trendingState.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadTrending()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp)
    ) {
        item {
            Text(
                text = "Trending Hashtags",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(bottom = 16.dp)
            )
        }

        items(trendingState.hashtags) { hashtag ->
            ListItem(
                headlineContent = { Text("#${hashtag.tag}") },
                supportingContent = { Text("${hashtag.postCount} posts") }
            )
            HorizontalDivider()
        }
    }
}

@Composable
private fun SearchResults(searchState: SearchState, viewModel: SearchViewModel) {
    LazyColumn(
        modifier = Modifier.fillMaxSize()
    ) {
        // Users section
        if (searchState.users.isNotEmpty()) {
            item {
                Text(
                    text = "Users",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(16.dp)
                )
            }

            items(searchState.users) { user ->
                ListItem(
                    leadingContent = {
                        // User avatar placeholder
                    },
                    headlineContent = { Text(user.resolvedDisplayName) },
                    supportingContent = { Text(user.displayUsername) }
                )
                HorizontalDivider()
            }
        }

        // Posts section
        if (searchState.posts.isNotEmpty()) {
            item {
                Text(
                    text = "Posts",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(16.dp)
                )
            }

            items(searchState.posts) { post ->
                PostCard(
                    post = post,
                    onLikeClick = { },
                    onRepostClick = { },
                    onBookmarkClick = { },
                    onPostClick = { },
                    onUserClick = { }
                )
                HorizontalDivider()
            }
        }

        // Groups section
        if (searchState.groups.isNotEmpty()) {
            item {
                Text(
                    text = "Groups",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(16.dp)
                )
            }

            items(searchState.groups) { group ->
                ListItem(
                    headlineContent = { Text(group.name) },
                    supportingContent = { Text("${group.memberCount} members") }
                )
                HorizontalDivider()
            }
        }
    }
}
