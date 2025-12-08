// =================================
// DATA MODELS
// =================================

package io.textmesh.app.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// =================================
// USER
// =================================

@Serializable
data class User(
    val id: String,
    val username: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val bio: String? = null,
    val isVerified: Boolean = false,
    val followerCount: Int = 0,
    val followingCount: Int = 0,
    val postCount: Int = 0,
    var isFollowing: Boolean? = null,
    var isBlocked: Boolean? = null,
    val createdAt: String
) {
    val displayUsername: String get() = "@$username"
    val resolvedDisplayName: String get() = displayName ?: username
}

// =================================
// POST
// =================================

@Serializable
data class Post(
    val id: String,
    val content: String,
    val visibility: PostVisibility,
    val user: User,
    val parentId: String? = null,
    val quotedPostId: String? = null,
    val quotedPost: Post? = null,
    val groupId: String? = null,
    var likeCount: Int = 0,
    val replyCount: Int = 0,
    var repostCount: Int = 0,
    var isLiked: Boolean = false,
    var isReposted: Boolean = false,
    var isBookmarked: Boolean = false,
    val hashtags: List<String> = emptyList(),
    val mentions: List<String> = emptyList(),
    val createdAt: String
)

@Serializable
enum class PostVisibility {
    @SerialName("PUBLIC") PUBLIC,
    @SerialName("FOLLOWERS") FOLLOWERS,
    @SerialName("PRIVATE") PRIVATE
}

// =================================
// GROUP
// =================================

@Serializable
data class Group(
    val id: String,
    val name: String,
    val slug: String,
    val description: String? = null,
    val avatarUrl: String? = null,
    val privacy: GroupPrivacy,
    val memberCount: Int = 0,
    val postCount: Int = 0,
    var isMember: Boolean = false,
    val memberRole: GroupRole? = null,
    val createdAt: String
)

@Serializable
enum class GroupPrivacy {
    @SerialName("PUBLIC") PUBLIC,
    @SerialName("PRIVATE") PRIVATE,
    @SerialName("SECRET") SECRET
}

@Serializable
enum class GroupRole {
    @SerialName("OWNER") OWNER,
    @SerialName("ADMIN") ADMIN,
    @SerialName("MODERATOR") MODERATOR,
    @SerialName("MEMBER") MEMBER
}

// =================================
// NOTIFICATION
// =================================

@Serializable
data class AppNotification(
    val id: String,
    val type: NotificationType,
    val actor: User,
    val postId: String? = null,
    val groupId: String? = null,
    var isRead: Boolean = false,
    val createdAt: String
)

@Serializable
enum class NotificationType {
    @SerialName("FOLLOW") FOLLOW,
    @SerialName("LIKE") LIKE,
    @SerialName("REPLY") REPLY,
    @SerialName("MENTION") MENTION,
    @SerialName("REPOST") REPOST,
    @SerialName("GROUP_INVITE") GROUP_INVITE
}

// =================================
// API RESPONSES
// =================================

@Serializable
data class ApiResponse<T>(
    val success: Boolean,
    val data: T
)

@Serializable
data class PaginatedData<T>(
    val items: List<T>,
    val nextCursor: String? = null,
    val hasMore: Boolean = false
)

@Serializable
data class AuthData(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Int,
    val user: User
)

@Serializable
data class NotificationData(
    val items: List<AppNotification>,
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
    val unreadCount: Int = 0
)

@Serializable
data class SearchData(
    val users: PaginatedData<User>? = null,
    val posts: PaginatedData<Post>? = null,
    val groups: PaginatedData<Group>? = null,
    val hashtags: List<String>? = null
)

@Serializable
data class TrendingHashtag(
    val tag: String,
    val postCount: Int
)

// =================================
// REQUEST MODELS
// =================================

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class RegisterRequest(
    val username: String,
    val email: String,
    val password: String,
    val dateOfBirth: String
)

@Serializable
data class CreatePostRequest(
    val content: String,
    val visibility: PostVisibility = PostVisibility.PUBLIC,
    val groupId: String? = null,
    val parentId: String? = null,
    val quotedPostId: String? = null
)

@Serializable
data class RefreshTokenRequest(
    val refreshToken: String
)
