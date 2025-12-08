// =================================
// API SERVICE
// =================================

package io.textmesh.app.data.api

import io.textmesh.app.data.models.*
import retrofit2.http.*

interface ApiService {

    // =================================
    // AUTH
    // =================================

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): ApiResponse<AuthData>

    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): ApiResponse<AuthData>

    @POST("auth/refresh")
    suspend fun refreshToken(@Body request: RefreshTokenRequest): ApiResponse<AuthData>

    @POST("auth/logout")
    suspend fun logout()

    // =================================
    // USERS
    // =================================

    @GET("users/me")
    suspend fun getCurrentUser(): ApiResponse<User>

    @PATCH("users/me")
    suspend fun updateProfile(@Body updates: Map<String, String?>): ApiResponse<User>

    @GET("users/{username}")
    suspend fun getUserByUsername(@Path("username") username: String): ApiResponse<User>

    @POST("users/{userId}/follow")
    suspend fun followUser(@Path("userId") userId: String)

    @DELETE("users/{userId}/follow")
    suspend fun unfollowUser(@Path("userId") userId: String)

    @GET("users/{userId}/followers")
    suspend fun getFollowers(
        @Path("userId") userId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<PaginatedData<User>>

    @GET("users/{userId}/following")
    suspend fun getFollowing(
        @Path("userId") userId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<PaginatedData<User>>

    @GET("users/{userId}/posts")
    suspend fun getUserPosts(
        @Path("userId") userId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
        @Query("includeReplies") includeReplies: Boolean = false
    ): ApiResponse<PaginatedData<Post>>

    @GET("users/me/bookmarks")
    suspend fun getBookmarks(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<PaginatedData<Post>>

    // =================================
    // POSTS
    // =================================

    @POST("posts")
    suspend fun createPost(@Body request: CreatePostRequest): ApiResponse<Post>

    @GET("posts/{postId}")
    suspend fun getPost(@Path("postId") postId: String): ApiResponse<Post>

    @DELETE("posts/{postId}")
    suspend fun deletePost(@Path("postId") postId: String)

    @POST("posts/{postId}/like")
    suspend fun likePost(@Path("postId") postId: String)

    @DELETE("posts/{postId}/like")
    suspend fun unlikePost(@Path("postId") postId: String)

    @POST("posts/{postId}/repost")
    suspend fun repost(@Path("postId") postId: String)

    @DELETE("posts/{postId}/repost")
    suspend fun unrepost(@Path("postId") postId: String)

    @POST("posts/{postId}/bookmark")
    suspend fun bookmarkPost(@Path("postId") postId: String)

    @DELETE("posts/{postId}/bookmark")
    suspend fun unbookmarkPost(@Path("postId") postId: String)

    @GET("posts/{postId}/replies")
    suspend fun getReplies(
        @Path("postId") postId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<PaginatedData<Post>>

    // =================================
    // FEED
    // =================================

    @GET("feed/home")
    suspend fun getHomeFeed(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<PaginatedData<Post>>

    @GET("feed/discover")
    suspend fun getDiscoverFeed(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<PaginatedData<Post>>

    @GET("feed/hashtag/{tag}")
    suspend fun getHashtagFeed(
        @Path("tag") tag: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<PaginatedData<Post>>

    // =================================
    // GROUPS
    // =================================

    @GET("groups")
    suspend fun getGroups(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<PaginatedData<Group>>

    @GET("groups/{groupId}")
    suspend fun getGroup(@Path("groupId") groupId: String): ApiResponse<Group>

    @POST("groups/{groupId}/join")
    suspend fun joinGroup(@Path("groupId") groupId: String)

    @POST("groups/{groupId}/leave")
    suspend fun leaveGroup(@Path("groupId") groupId: String)

    @GET("groups/{groupId}/feed")
    suspend fun getGroupFeed(
        @Path("groupId") groupId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<PaginatedData<Post>>

    // =================================
    // NOTIFICATIONS
    // =================================

    @GET("notifications")
    suspend fun getNotifications(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<NotificationData>

    @POST("notifications/mark-read")
    suspend fun markNotificationsRead(@Body body: Map<String, Any>)

    // =================================
    // SEARCH
    // =================================

    @GET("search")
    suspend fun search(
        @Query("q") query: String,
        @Query("type") type: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20
    ): ApiResponse<SearchData>

    @GET("search/trending/hashtags")
    suspend fun getTrendingHashtags(): ApiResponse<Map<String, List<TrendingHashtag>>>
}
