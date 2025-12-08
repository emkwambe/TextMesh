// =================================
// USER MODEL
// =================================

import Foundation

struct User: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let username: String
    let displayName: String?
    let avatarUrl: String?
    let bio: String?
    let isVerified: Bool
    let followerCount: Int
    let followingCount: Int
    let postCount: Int
    var isFollowing: Bool?
    var isBlocked: Bool?
    let createdAt: Date

    var displayUsername: String {
        "@\(username)"
    }

    var resolvedDisplayName: String {
        displayName ?? username
    }

    static func == (lhs: User, rhs: User) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

struct UserResponse: Codable {
    let success: Bool
    let data: User
}

struct UserListResponse: Codable {
    let success: Bool
    let data: UserListData
}

struct UserListData: Codable {
    let items: [User]
    let nextCursor: String?
    let hasMore: Bool
}

struct UpdateProfileRequest: Codable {
    var displayName: String?
    var bio: String?
    var avatarUrl: String?
    var websiteUrl: String?
    var location: String?
}
