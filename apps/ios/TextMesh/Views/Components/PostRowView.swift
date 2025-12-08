// =================================
// POST ROW VIEW
// =================================

import SwiftUI

struct PostRowView: View {
    let post: Post
    @StateObject private var viewModel: PostActionViewModel

    init(post: Post) {
        self.post = post
        _viewModel = StateObject(wrappedValue: PostActionViewModel(post: post))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(alignment: .top, spacing: 12) {
                // Avatar
                AsyncImage(url: URL(string: post.user.avatarUrl ?? "")) { image in
                    image.resizable()
                } placeholder: {
                    Circle()
                        .fill(Color(.systemGray4))
                        .overlay {
                            Text(post.user.resolvedDisplayName.prefix(1).uppercased())
                                .font(.headline)
                                .foregroundColor(.secondary)
                        }
                }
                .frame(width: 44, height: 44)
                .clipShape(Circle())

                VStack(alignment: .leading, spacing: 4) {
                    // Name and username
                    HStack(spacing: 4) {
                        Text(post.user.resolvedDisplayName)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)

                        if post.user.isVerified {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundColor(.accentColor)
                                .font(.caption)
                        }

                        Text(post.user.displayUsername)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(1)

                        Text("·")
                            .foregroundColor(.secondary)

                        Text(post.formattedDate)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }

                    // Content
                    Text(post.content)
                        .font(.body)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)

                    // Quoted post
                    if let quotedPost = post.quotedPost {
                        QuotedPostView(post: quotedPost)
                    }

                    // Actions
                    HStack(spacing: 0) {
                        ActionButton(
                            icon: "bubble.left",
                            count: post.replyCount,
                            isActive: false,
                            activeColor: .accentColor
                        ) {}

                        Spacer()

                        ActionButton(
                            icon: "arrow.2.squarepath",
                            count: viewModel.repostCount,
                            isActive: viewModel.isReposted,
                            activeColor: .green
                        ) {
                            Task { await viewModel.toggleRepost() }
                        }

                        Spacer()

                        ActionButton(
                            icon: viewModel.isLiked ? "heart.fill" : "heart",
                            count: viewModel.likeCount,
                            isActive: viewModel.isLiked,
                            activeColor: .red
                        ) {
                            Task { await viewModel.toggleLike() }
                        }

                        Spacer()

                        ActionButton(
                            icon: viewModel.isBookmarked ? "bookmark.fill" : "bookmark",
                            count: 0,
                            isActive: viewModel.isBookmarked,
                            activeColor: .accentColor,
                            showCount: false
                        ) {
                            Task { await viewModel.toggleBookmark() }
                        }

                        Spacer()

                        Button(action: {}) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.top, 8)
                }
            }
        }
        .padding()
    }
}

// MARK: - Action Button

struct ActionButton: View {
    let icon: String
    let count: Int
    let isActive: Bool
    let activeColor: Color
    var showCount: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.subheadline)

                if showCount && count > 0 {
                    Text(formatCount(count))
                        .font(.caption)
                }
            }
            .foregroundColor(isActive ? activeColor : .secondary)
        }
    }

    private func formatCount(_ count: Int) -> String {
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000)
        } else if count >= 1_000 {
            return String(format: "%.1fK", Double(count) / 1_000)
        }
        return "\(count)"
    }
}

// MARK: - Quoted Post View

struct QuotedPostView: View {
    let post: Post

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                AsyncImage(url: URL(string: post.user.avatarUrl ?? "")) { image in
                    image.resizable()
                } placeholder: {
                    Circle().fill(Color(.systemGray4))
                }
                .frame(width: 20, height: 20)
                .clipShape(Circle())

                Text(post.user.resolvedDisplayName)
                    .font(.caption.weight(.semibold))

                Text(post.user.displayUsername)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Text(post.content)
                .font(.subheadline)
                .lineLimit(3)
        }
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(.systemGray4), lineWidth: 1)
        )
    }
}

// MARK: - View Model

@MainActor
class PostActionViewModel: ObservableObject {
    @Published var isLiked: Bool
    @Published var isReposted: Bool
    @Published var isBookmarked: Bool
    @Published var likeCount: Int
    @Published var repostCount: Int

    private let postId: String

    init(post: Post) {
        self.postId = post.id
        self.isLiked = post.isLiked
        self.isReposted = post.isReposted
        self.isBookmarked = post.isBookmarked
        self.likeCount = post.likeCount
        self.repostCount = post.repostCount
    }

    func toggleLike() async {
        let wasLiked = isLiked
        isLiked.toggle()
        likeCount += isLiked ? 1 : -1

        do {
            if isLiked {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/like", method: .post)
            } else {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/like", method: .delete)
            }
        } catch {
            isLiked = wasLiked
            likeCount += wasLiked ? 1 : -1
        }
    }

    func toggleRepost() async {
        let wasReposted = isReposted
        isReposted.toggle()
        repostCount += isReposted ? 1 : -1

        do {
            if isReposted {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/repost", method: .post)
            } else {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/repost", method: .delete)
            }
        } catch {
            isReposted = wasReposted
            repostCount += wasReposted ? 1 : -1
        }
    }

    func toggleBookmark() async {
        let wasBookmarked = isBookmarked
        isBookmarked.toggle()

        do {
            if isBookmarked {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/bookmark", method: .post)
            } else {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/bookmark", method: .delete)
            }
        } catch {
            isBookmarked = wasBookmarked
        }
    }
}

#Preview {
    PostRowView(post: Post(
        id: "1",
        content: "This is a sample post with some interesting content! #SwiftUI #iOS",
        visibility: .public,
        user: User(
            id: "1",
            username: "johndoe",
            displayName: "John Doe",
            avatarUrl: nil,
            bio: "iOS Developer",
            isVerified: true,
            followerCount: 1234,
            followingCount: 567,
            postCount: 89,
            createdAt: Date()
        ),
        parentId: nil,
        quotedPostId: nil,
        quotedPost: nil,
        groupId: nil,
        likeCount: 42,
        replyCount: 12,
        repostCount: 5,
        isLiked: false,
        isReposted: false,
        isBookmarked: false,
        hashtags: ["SwiftUI", "iOS"],
        mentions: [],
        createdAt: Date()
    ))
}
