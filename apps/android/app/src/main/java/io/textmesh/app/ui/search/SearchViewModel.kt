// =================================
// SEARCH VIEW MODEL
// =================================

package io.textmesh.app.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.textmesh.app.data.api.ApiService
import io.textmesh.app.data.models.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class SearchState(
    val users: List<User> = emptyList(),
    val posts: List<Post> = emptyList(),
    val groups: List<Group> = emptyList(),
    val hashtags: List<String> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

data class TrendingState(
    val hashtags: List<TrendingHashtag> = emptyList(),
    val isLoading: Boolean = false
)

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _searchState = MutableStateFlow(SearchState())
    val searchState: StateFlow<SearchState> = _searchState.asStateFlow()

    private val _trendingState = MutableStateFlow(TrendingState())
    val trendingState: StateFlow<TrendingState> = _trendingState.asStateFlow()

    private var searchJob: Job? = null

    fun search(query: String) {
        searchJob?.cancel()

        if (query.length < 2) {
            _searchState.update { SearchState() }
            return
        }

        searchJob = viewModelScope.launch {
            delay(300) // Debounce

            _searchState.update { it.copy(isLoading = true, error = null) }

            try {
                val response = apiService.search(query)

                _searchState.update {
                    it.copy(
                        users = response.data.users?.items ?: emptyList(),
                        posts = response.data.posts?.items ?: emptyList(),
                        groups = response.data.groups?.items ?: emptyList(),
                        hashtags = response.data.hashtags ?: emptyList(),
                        isLoading = false
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Search failed")
                _searchState.update {
                    it.copy(
                        isLoading = false,
                        error = e.message
                    )
                }
            }
        }
    }

    fun loadTrending() {
        viewModelScope.launch {
            _trendingState.update { it.copy(isLoading = true) }

            try {
                val response = apiService.getTrendingHashtags()
                _trendingState.update {
                    it.copy(
                        hashtags = response.data["hashtags"] ?: emptyList(),
                        isLoading = false
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to load trending")
                _trendingState.update { it.copy(isLoading = false) }
            }
        }
    }
}
