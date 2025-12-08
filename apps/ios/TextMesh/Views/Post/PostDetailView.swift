// =================================
// POST DETAIL VIEW
// =================================

import SwiftUI

struct PostDetailView: View {
    let post: Post
    @StateObject private var viewModel: PostDetailViewModel
    @State private var showingReplySheet = false
    @State private var showingReportSheet = false

    init(post: Post) {
        self.post = post
        _viewModel = StateObject(wrappedValue: PostDetailViewModel(post: post))
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                // Main post
                VStack(alignment: .leading, spacing: 16) {
                    // User info
                    HStack(spacing: 12) {
                        NavigationLink(destination: ProfileView(user: post.user)) {
                            AsyncImage(url: URL(string: post.user.avatarUrl ?? "")) { image in
                                image.resizable()
                            } placeholder: {
                                Circle()
                                    .fill(Color(.systemGray4))
                            }
                            .frame(width: 48, height: 48)
                            .clipShape(Circle())
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 4) {
                                Text(post.user.resolvedDisplayName)
                                    .font(.headline)

                                if post.user.isVerified {
                                    Image(systemName: "checkmark.seal.fill")
                                        .foregroundColor(.accentColor)
                                        .font(.caption)
                                }
                            }

                            Text(post.user.displayUsername)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        Menu {
                            Button("Copy link") {}
                            Button("Share") {}
                            Divider()
                            Button("Report post", role: .destructive) {
                                showingReportSheet = true
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .foregroundColor(.secondary)
                        }
                    }

                    // Content
                    Text(post.content)
                        .font(.body)

                    // Quoted post
                    if let quotedPost = post.quotedPost {
                        QuotedPostView(post: quotedPost)
                    }

                    // Timestamp
                    Text(post.createdAt, style: .date)
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    // Stats
                    HStack(spacing: 16) {
                        StatItem(count: viewModel.likeCount, label: "Likes")
                        StatItem(count: post.replyCount, label: "Replies")
                        StatItem(count: viewModel.repostCount, label: "Reposts")
                    }
                    .padding(.top, 8)

                    Divider()

                    // Actions
                    HStack {
                        Spacer()

                        Button {
                            showingReplySheet = true
                        } label: {
                            Image(systemName: "bubble.left")
                                .font(.title3)
                        }

                        Spacer()

                        Button {
                            Task { await viewModel.toggleRepost() }
                        } label: {
                            Image(systemName: "arrow.2.squarepath")
                                .font(.title3)
                                .foregroundColor(viewModel.isReposted ? .green : .secondary)
                        }

                        Spacer()

                        Button {
                            Task { await viewModel.toggleLike() }
                        } label: {
                            Image(systemName: viewModel.isLiked ? "heart.fill" : "heart")
                                .font(.title3)
                                .foregroundColor(viewModel.isLiked ? .red : .secondary)
                        }

                        Spacer()

                        Button {
                            Task { await viewModel.toggleBookmark() }
                        } label: {
                            Image(systemName: viewModel.isBookmarked ? "bookmark.fill" : "bookmark")
                                .font(.title3)
                                .foregroundColor(viewModel.isBookmarked ? .accentColor : .secondary)
                        }

                        Spacer()

                        ShareLink(item: "https://textmesh.io/post/\(post.id)") {
                            Image(systemName: "square.and.arrow.up")
                                .font(.title3)
                        }

                        Spacer()
                    }
                    .foregroundColor(.secondary)
                    .padding(.vertical, 8)
                }
                .padding()

                Divider()

                // Replies
                ForEach(viewModel.replies) { reply in
                    NavigationLink(destination: PostDetailView(post: reply)) {
                        PostRowView(post: reply)
                    }
                    .buttonStyle(.plain)
                    Divider()
                }

                if viewModel.hasMoreReplies {
                    ProgressView()
                        .padding()
                        .onAppear {
                            Task { await viewModel.loadMoreReplies() }
                        }
                }
            }
        }
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingReplySheet) {
            ComposePostView(replyTo: post)
        }
        .sheet(isPresented: $showingReportSheet) {
            ReportView(targetType: .post, targetId: post.id)
        }
        .task {
            await viewModel.loadReplies()
        }
    }
}

// MARK: - Stat Item

struct StatItem: View {
    let count: Int
    let label: String

    var body: some View {
        HStack(spacing: 4) {
            Text("\(count)")
                .fontWeight(.semibold)
            Text(label)
                .foregroundColor(.secondary)
        }
        .font(.subheadline)
    }
}

// MARK: - View Model

@MainActor
class PostDetailViewModel: ObservableObject {
    @Published var replies: [Post] = []
    @Published var hasMoreReplies = true
    @Published var isLiked: Bool
    @Published var isReposted: Bool
    @Published var isBookmarked: Bool
    @Published var likeCount: Int
    @Published var repostCount: Int

    private let postId: String
    private var cursor: String?

    init(post: Post) {
        self.postId = post.id
        self.isLiked = post.isLiked
        self.isReposted = post.isReposted
        self.isBookmarked = post.isBookmarked
        self.likeCount = post.likeCount
        self.repostCount = post.repostCount
    }

    func loadReplies() async {
        do {
            let response = try await APIClient.shared.request(
                PostListResponse.self,
                path: "/posts/\(postId)/replies"
            )
            replies = response.data.items
            cursor = response.data.nextCursor
            hasMoreReplies = response.data.hasMore
        } catch {
            // Handle error
        }
    }

    func loadMoreReplies() async {
        guard hasMoreReplies, let cursor = cursor else { return }

        do {
            let response = try await APIClient.shared.request(
                PostListResponse.self,
                path: "/posts/\(postId)/replies",
                queryItems: [URLQueryItem(name: "cursor", value: cursor)]
            )
            replies.append(contentsOf: response.data.items)
            self.cursor = response.data.nextCursor
            hasMoreReplies = response.data.hasMore
        } catch {
            // Handle error
        }
    }

    func toggleLike() async {
        isLiked.toggle()
        likeCount += isLiked ? 1 : -1

        do {
            if isLiked {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/like", method: .post)
            } else {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/like", method: .delete)
            }
        } catch {
            isLiked.toggle()
            likeCount += isLiked ? 1 : -1
        }
    }

    func toggleRepost() async {
        isReposted.toggle()
        repostCount += isReposted ? 1 : -1

        do {
            if isReposted {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/repost", method: .post)
            } else {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/repost", method: .delete)
            }
        } catch {
            isReposted.toggle()
            repostCount += isReposted ? 1 : -1
        }
    }

    func toggleBookmark() async {
        isBookmarked.toggle()

        do {
            if isBookmarked {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/bookmark", method: .post)
            } else {
                try await APIClient.shared.requestVoid(path: "/posts/\(postId)/bookmark", method: .delete)
            }
        } catch {
            isBookmarked.toggle()
        }
    }
}

// MARK: - Report View

struct ReportView: View {
    let targetType: ReportTargetType
    let targetId: String
    @Environment(\.dismiss) var dismiss
    @State private var selectedReason: ReportReason?
    @State private var description = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            List {
                Section("Why are you reporting this?") {
                    ForEach(ReportReason.allCases, id: \.self) { reason in
                        Button {
                            selectedReason = reason
                        } label: {
                            HStack {
                                Text(reason.displayName)
                                Spacer()
                                if selectedReason == reason {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.accentColor)
                                }
                            }
                        }
                        .foregroundColor(.primary)
                    }
                }

                if selectedReason != nil {
                    Section("Additional details (optional)") {
                        TextEditor(text: $description)
                            .frame(minHeight: 100)
                    }
                }
            }
            .navigationTitle("Report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") {
                        Task { await submit() }
                    }
                    .disabled(selectedReason == nil || isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        guard let reason = selectedReason else { return }

        isSubmitting = true

        struct ReportRequest: Codable {
            let targetType: String
            let targetId: String
            let reason: String
            let description: String?
        }

        do {
            try await APIClient.shared.requestVoid(
                path: "/reports",
                method: .post,
                body: ReportRequest(
                    targetType: targetType.rawValue,
                    targetId: targetId,
                    reason: reason.rawValue,
                    description: description.isEmpty ? nil : description
                )
            )
            dismiss()
        } catch {
            // Handle error
        }

        isSubmitting = false
    }
}

enum ReportTargetType: String {
    case post = "POST"
    case user = "USER"
    case group = "GROUP"
}

enum ReportReason: String, CaseIterable {
    case spam = "SPAM"
    case harassment = "HARASSMENT"
    case hateSpeech = "HATE_SPEECH"
    case violence = "VIOLENCE"
    case sexualContent = "SEXUAL_CONTENT"
    case misinformation = "MISINFORMATION"
    case other = "OTHER"

    var displayName: String {
        switch self {
        case .spam: return "Spam"
        case .harassment: return "Harassment"
        case .hateSpeech: return "Hate speech"
        case .violence: return "Violence or threats"
        case .sexualContent: return "Sexual content"
        case .misinformation: return "Misinformation"
        case .other: return "Other"
        }
    }
}
