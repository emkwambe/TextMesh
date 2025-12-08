# TextMesh API Overview

## Base URL
```
Production: https://api.textmesh.com/v1
Staging: https://api-staging.textmesh.com/v1
Local: http://localhost:3001/api
```

## Authentication

All API requests require authentication via Bearer token:

```http
Authorization: Bearer <jwt_token>
```

### Obtaining Tokens

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}

Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr_abc123",
    "username": "johndoe",
    "displayName": "John Doe"
  }
}
```

## Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 5 | 15 min |
| Read (GET) | 300 | 15 min |
| Write (POST/PUT) | 60 | 15 min |
| Search | 30 | 15 min |

Rate limit headers:
```http
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 299
X-RateLimit-Reset: 1704067200
```

## Core Endpoints

### Users

```http
GET    /users/:username          # Get user profile
GET    /users/:username/posts    # Get user's posts
GET    /users/:username/likes    # Get user's likes
GET    /users/:username/followers # Get followers
GET    /users/:username/following # Get following
PUT    /users/me                 # Update current user
DELETE /users/me                 # Delete account
```

### Posts

```http
POST   /posts                    # Create post
GET    /posts/:id                # Get post
DELETE /posts/:id                # Delete post
GET    /posts/:id/replies        # Get replies
POST   /posts/:id/like           # Like post
DELETE /posts/:id/like           # Unlike post
POST   /posts/:id/repost         # Repost
DELETE /posts/:id/repost         # Undo repost
POST   /posts/:id/bookmark       # Bookmark
DELETE /posts/:id/bookmark       # Remove bookmark
```

### Feed

```http
GET    /feed/for-you             # Personalized feed
GET    /feed/following           # Following feed
GET    /feed/trending            # Trending posts
```

Query parameters:
- `limit`: Number of posts (default: 20, max: 50)
- `cursor`: Pagination cursor

### Social

```http
POST   /users/:username/follow   # Follow user
DELETE /users/:username/follow   # Unfollow user
GET    /users/:username/relationship # Get relationship
```

### Search

```http
GET    /search?q=query           # Search all
GET    /search/users?q=query     # Search users
GET    /search/posts?q=query     # Search posts
GET    /search/hashtags?q=query  # Search hashtags
```

### Notifications

```http
GET    /notifications            # Get notifications
PUT    /notifications/read       # Mark all as read
PUT    /notifications/:id/read   # Mark one as read
```

## Request/Response Examples

### Create Post
```http
POST /posts
Content-Type: application/json
Authorization: Bearer <token>

{
  "content": "Hello TextMesh! #firstpost",
  "replyToId": null
}

Response: 201 Created
{
  "success": true,
  "post": {
    "id": "post_xyz789",
    "content": "Hello TextMesh! #firstpost",
    "author": {
      "id": "usr_abc123",
      "username": "johndoe",
      "displayName": "John Doe",
      "isVerified": false
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "likesCount": 0,
    "commentsCount": 0,
    "repostsCount": 0,
    "isLiked": false,
    "isBookmarked": false,
    "isReposted": false
  }
}
```

### Get Feed
```http
GET /feed/for-you?limit=20
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "posts": [
    {
      "id": "post_xyz789",
      "content": "Just launched my new project...",
      "author": {...},
      "createdAt": "2024-01-15T10:30:00Z",
      "likesCount": 42,
      "commentsCount": 5,
      "repostsCount": 3,
      "isLiked": true,
      "isBookmarked": false,
      "isReposted": false
    }
  ],
  "nextCursor": "eyJpZCI6InBvc3RfeHl6..."
}
```

### Follow User
```http
POST /users/sarahc/follow
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "following": true
}
```

## Error Responses

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Content cannot be empty",
    "field": "content"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid input data |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

## Webhooks

TextMesh supports webhooks for real-time event notifications.

### Events
- `post.created`
- `post.deleted`
- `user.followed`
- `user.unfollowed`
- `notification.created`

### Webhook Payload
```json
{
  "event": "post.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "postId": "post_xyz789",
    "userId": "usr_abc123"
  },
  "signature": "sha256=..."
}
```

## SDKs

Official SDKs available:
- JavaScript/TypeScript: `@textmesh/sdk`
- Python: `textmesh-python`
- Swift: `TextMeshSDK`
- Kotlin: `textmesh-android`

## OpenAPI Specification

Full OpenAPI 3.0 spec available at:
```
https://api.textmesh.com/v1/openapi.json
```
