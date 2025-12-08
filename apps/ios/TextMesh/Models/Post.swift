// =================================
// POST MODEL
// =================================

import Foundation

struct Post: Codable, Identifiable, Equatable {
    let id: String
    let content: String
    let visibility: PostVisibility
    let user: User
    let parentId: String?
    let quotedPostId: String?
    let quotedPost: Post?
    let groupId: String?
    var likeCount: Int
    var replyCount: Int
    var repostCount: Int
    var isLiked: Bool
    var isReposted: Bool
    var isBookmarked: Bool
    let hashtags: [String]
    let mentions: [String]
    let createdAt: Date

    var isReply: Bool {
        parentId != nil
    }

    var isQuote: Bool {
        quotedPostId != nil
    }

    var formattedDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: createdAt, relativeTo: Date())
    }

    static func == (lhs: Post, rhs: Post) -> Bool {
        lhs.id == rhs.id
    }
}

enum PostVisibility: String, Codable, CaseIterable {
    case `public` = "PUBLIC"
    case followers = "FOLLOWERS"
    case `private` = "PRIVATE"

    var displayName: String {
        switch self {
        case .public: return "Everyone"
        case .followers: return "Followers"
        case .private: return "Only me"
        }
    }

    var icon: String {
        switch self {
        case .public: return "globe"
        case .followers: return "person.2"
        case .private: return "lock"
        }
    }
}

struct PostResponse: Codable {
    let success: Bool
    let data: Post
}

struct PostListResponse: Codable {
    let success: Bool
    let data: PostListData
}

struct PostListData: Codable {
    let items: [Post]
    let nextCursor: String?
    let hasMore: Bool
}

struct CreatePostRequest: Codable {
    let content: String
    let visibility: PostVisibility
    let groupId: String?
    let parentId: String?
    let quotedPostId: String?

    init(content: String, visibility: PostVisibility = .public, groupId: String? = nil, parentId: String? = nil, quotedPostId: String? = nil) {
        self.content = content
        self.visibility = visibility
        self.groupId = groupId
        self.parentId = parentId
        self.quotedPostId = quotedPostId
    }
}
