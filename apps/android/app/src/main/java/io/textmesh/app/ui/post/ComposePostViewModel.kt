// =================================
// COMPOSE POST VIEW MODEL
// =================================

package io.textmesh.app.ui.post

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.textmesh.app.data.api.ApiService
import io.textmesh.app.data.models.CreatePostRequest
import io.textmesh.app.data.models.PostVisibility
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class ComposeState(
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class ComposePostViewModel @Inject constructor(
    private val apiService: ApiService
) : ViewModel() {

    private val _composeState = MutableStateFlow(ComposeState())
    val composeState: StateFlow<ComposeState> = _composeState.asStateFlow()

    fun createPost(
        content: String,
        visibility: PostVisibility,
        groupId: String? = null,
        parentId: String? = null,
        quotedPostId: String? = null
    ) {
        viewModelScope.launch {
            _composeState.update { it.copy(isLoading = true, error = null) }

            try {
                apiService.createPost(
                    CreatePostRequest(
                        content = content,
                        visibility = visibility,
                        groupId = groupId,
                        parentId = parentId,
                        quotedPostId = quotedPostId
                    )
                )

                _composeState.update {
                    it.copy(
                        isLoading = false,
                        isSuccess = true
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to create post")
                _composeState.update {
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to create post"
                    )
                }
            }
        }
    }

    fun reset() {
        _composeState.update { ComposeState() }
    }
}
