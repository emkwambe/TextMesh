// =================================
// NOTIFICATION MODEL
// =================================

import Foundation

struct AppNotification: Codable, Identifiable {
    let id: String
    let type: NotificationType
    let actor: User
    let postId: String?
    let groupId: String?
    var isRead: Bool
    let createdAt: Date

    var message: String {
        switch type {
        case .follow:
            return "followed you"
        case .like:
            return "liked your post"
        case .reply:
            return "replied to your post"
        case .mention:
            return "mentioned you"
        case .repost:
            return "reposted your post"
        case .groupInvite:
            return "invited you to a group"
        }
    }

    var icon: String {
        switch type {
        case .follow: return "person.badge.plus"
        case .like: return "heart.fill"
        case .reply: return "bubble.left.fill"
        case .mention: return "at"
        case .repost: return "arrow.2.squarepath"
        case .groupInvite: return "person.3.fill"
        }
    }
}

enum NotificationType: String, Codable {
    case follow = "FOLLOW"
    case like = "LIKE"
    case reply = "REPLY"
    case mention = "MENTION"
    case repost = "REPOST"
    case groupInvite = "GROUP_INVITE"
}

struct NotificationListResponse: Codable {
    let success: Bool
    let data: NotificationListData
}

struct NotificationListData: Codable {
    let items: [AppNotification]
    let nextCursor: String?
    let hasMore: Bool
    let unreadCount: Int
}
