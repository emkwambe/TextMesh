// =================================
// GROUP MODEL
// =================================

import Foundation

struct Group: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let slug: String
    let description: String?
    let avatarUrl: String?
    let privacy: GroupPrivacy
    let memberCount: Int
    let postCount: Int
    var isMember: Bool
    var memberRole: GroupRole?
    let createdAt: Date

    static func == (lhs: Group, rhs: Group) -> Bool {
        lhs.id == rhs.id
    }
}

enum GroupPrivacy: String, Codable, CaseIterable {
    case `public` = "PUBLIC"
    case `private` = "PRIVATE"
    case secret = "SECRET"

    var displayName: String {
        switch self {
        case .public: return "Public"
        case .private: return "Private"
        case .secret: return "Secret"
        }
    }

    var description: String {
        switch self {
        case .public: return "Anyone can find and join"
        case .private: return "Anyone can find, but must request to join"
        case .secret: return "Only members can find"
        }
    }
}

enum GroupRole: String, Codable {
    case owner = "OWNER"
    case admin = "ADMIN"
    case moderator = "MODERATOR"
    case member = "MEMBER"
}

struct GroupMember: Codable, Identifiable {
    var id: String { user.id }
    let user: User
    let role: GroupRole
    let joinedAt: Date
}

struct GroupResponse: Codable {
    let success: Bool
    let data: Group
}

struct GroupListResponse: Codable {
    let success: Bool
    let data: GroupListData
}

struct GroupListData: Codable {
    let items: [Group]
    let nextCursor: String?
    let hasMore: Bool
}

struct GroupMemberListResponse: Codable {
    let success: Bool
    let data: GroupMemberListData
}

struct GroupMemberListData: Codable {
    let items: [GroupMember]
    let nextCursor: String?
    let hasMore: Bool
}

struct CreateGroupRequest: Codable {
    let name: String
    let description: String?
    let privacy: GroupPrivacy
    let rules: String?
}
