// =================================
// FEED VIEW MODEL
// =================================

package io.textmesh.app.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.textmesh.app.data.api.ApiService
import io.textmesh.app.data.models.Post
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class FeedState(
    val posts: List<Post> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = true,
    val error: String? = null,
    val cursor: String? = null
)

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _feedState = MutableStateFlow(FeedState())
    val feedState: StateFlow<FeedState> = _feedState.asStateFlow()

    fun loadFeed(type: FeedType) {
        viewModelScope.launch {
            _feedState.update { it.copy(isLoading = true, error = null, cursor = null) }

            try {
                val response = when (type) {
                    FeedType.HOME -> apiService.getHomeFeed()
                    FeedType.DISCOVER -> apiService.getDiscoverFeed()
                }

                _feedState.update {
                    it.copy(
                        posts = response.data.items,
                        isLoading = false,
                        hasMore = response.data.hasMore,
                        cursor = response.data.nextCursor
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to load feed")
                _feedState.update {
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to load feed"
                    )
                }
            }
        }
    }

    fun loadMore(type: FeedType) {
        val currentState = _feedState.value
        if (!currentState.hasMore || currentState.isLoadingMore || currentState.cursor == null) return

        viewModelScope.launch {
            _feedState.update { it.copy(isLoadingMore = true) }

            try {
                val response = when (type) {
                    FeedType.HOME -> apiService.getHomeFeed(cursor = currentState.cursor)
                    FeedType.DISCOVER -> apiService.getDiscoverFeed(cursor = currentState.cursor)
                }

                _feedState.update {
                    it.copy(
                        posts = it.posts + response.data.items,
                        isLoadingMore = false,
                        hasMore = response.data.hasMore,
                        cursor = response.data.nextCursor
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to load more")
                _feedState.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun toggleLike(postId: String) {
        viewModelScope.launch {
            val post = _feedState.value.posts.find { it.id == postId } ?: return@launch
            val wasLiked = post.isLiked

            // Optimistic update
            updatePost(postId) {
                it.copy(
                    isLiked = !wasLiked,
                    likeCount = if (wasLiked) it.likeCount - 1 else it.likeCount + 1
                )
            }

            try {
                if (wasLiked) {
                    apiService.unlikePost(postId)
                } else {
                    apiService.likePost(postId)
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to toggle like")
                // Revert on failure
                updatePost(postId) {
                    it.copy(
                        isLiked = wasLiked,
                        likeCount = if (wasLiked) it.likeCount + 1 else it.likeCount - 1
                    )
                }
            }
        }
    }

    fun toggleRepost(postId: String) {
        viewModelScope.launch {
            val post = _feedState.value.posts.find { it.id == postId } ?: return@launch
            val wasReposted = post.isReposted

            updatePost(postId) {
                it.copy(
                    isReposted = !wasReposted,
                    repostCount = if (wasReposted) it.repostCount - 1 else it.repostCount + 1
                )
            }

            try {
                if (wasReposted) {
                    apiService.unrepost(postId)
                } else {
                    apiService.repost(postId)
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to toggle repost")
                updatePost(postId) {
                    it.copy(
                        isReposted = wasReposted,
                        repostCount = if (wasReposted) it.repostCount + 1 else it.repostCount - 1
                    )
                }
            }
        }
    }

    fun toggleBookmark(postId: String) {
        viewModelScope.launch {
            val post = _feedState.value.posts.find { it.id == postId } ?: return@launch
            val wasBookmarked = post.isBookmarked

            updatePost(postId) { it.copy(isBookmarked = !wasBookmarked) }

            try {
                if (wasBookmarked) {
                    apiService.unbookmarkPost(postId)
                } else {
                    apiService.bookmarkPost(postId)
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to toggle bookmark")
                updatePost(postId) { it.copy(isBookmarked = wasBookmarked) }
            }
        }
    }

    private fun updatePost(postId: String, update: (Post) -> Post) {
        _feedState.update { state ->
            state.copy(
                posts = state.posts.map {
                    if (it.id == postId) update(it) else it
                }
            )
        }
    }
}
