// =================================
// PROFILE VIEW
// =================================

import SwiftUI

struct ProfileView: View {
    let user: User
    let isCurrentUser: Bool
    @StateObject private var viewModel: ProfileViewModel
    @EnvironmentObject var authManager: AuthManager
    @State private var showingSettings = false
    @State private var showingEditProfile = false

    init(user: User, isCurrentUser: Bool = false) {
        self.user = user
        self.isCurrentUser = isCurrentUser
        _viewModel = StateObject(wrappedValue: ProfileViewModel(user: user))
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                // Header
                ProfileHeaderView(
                    user: viewModel.user,
                    isCurrentUser: isCurrentUser,
                    isFollowing: viewModel.isFollowing,
                    onFollow: { Task { await viewModel.toggleFollow() } },
                    onEditProfile: { showingEditProfile = true }
                )

                Divider()

                // Posts
                Section {
                    ForEach(viewModel.posts) { post in
                        NavigationLink(destination: PostDetailView(post: post)) {
                            PostRowView(post: post)
                        }
                        .buttonStyle(.plain)
                        Divider()
                    }

                    if viewModel.hasMore && !viewModel.posts.isEmpty {
                        ProgressView()
                            .padding()
                            .onAppear {
                                Task { await viewModel.loadMorePosts() }
                            }
                    }
                } header: {
                    Picker("Posts", selection: $viewModel.selectedTab) {
                        Text("Posts").tag(ProfileTab.posts)
                        Text("Replies").tag(ProfileTab.replies)
                        Text("Likes").tag(ProfileTab.likes)
                    }
                    .pickerStyle(.segmented)
                    .padding()
                    .background(Color(.systemBackground))
                }
            }
        }
        .navigationTitle(isCurrentUser ? "Profile" : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isCurrentUser {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { showingSettings = true }) {
                        Image(systemName: "gearshape")
                    }
                }
            } else {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Share Profile", action: {})
                        Button("Block @\(user.username)", role: .destructive, action: {})
                        Button("Report @\(user.username)", role: .destructive, action: {})
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                }
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
        .sheet(isPresented: $showingEditProfile) {
            EditProfileView(user: viewModel.user)
        }
        .task {
            await viewModel.loadPosts()
        }
        .onChange(of: viewModel.selectedTab) { _, _ in
            Task { await viewModel.loadPosts() }
        }
    }
}

// MARK: - Profile Header

struct ProfileHeaderView: View {
    let user: User
    let isCurrentUser: Bool
    let isFollowing: Bool
    let onFollow: () -> Void
    let onEditProfile: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Avatar and action button
            HStack(alignment: .top) {
                AsyncImage(url: URL(string: user.avatarUrl ?? "")) { image in
                    image.resizable()
                } placeholder: {
                    Circle()
                        .fill(Color(.systemGray4))
                        .overlay {
                            Text(user.resolvedDisplayName.prefix(1).uppercased())
                                .font(.title)
                                .foregroundColor(.secondary)
                        }
                }
                .frame(width: 80, height: 80)
                .clipShape(Circle())

                Spacer()

                if isCurrentUser {
                    Button("Edit Profile", action: onEditProfile)
                        .buttonStyle(.bordered)
                } else {
                    Button(isFollowing ? "Following" : "Follow", action: onFollow)
                        .buttonStyle(isFollowing ? .bordered : .borderedProminent)
                }
            }

            // Name
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Text(user.resolvedDisplayName)
                        .font(.title2.bold())

                    if user.isVerified {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundColor(.accentColor)
                    }
                }

                Text(user.displayUsername)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            // Bio
            if let bio = user.bio, !bio.isEmpty {
                Text(bio)
                    .font(.body)
            }

            // Stats
            HStack(spacing: 24) {
                NavigationLink(destination: FollowListView(userId: user.id, type: .following)) {
                    HStack(spacing: 4) {
                        Text("\(user.followingCount)")
                            .fontWeight(.semibold)
                        Text("Following")
                            .foregroundColor(.secondary)
                    }
                    .font(.subheadline)
                }
                .buttonStyle(.plain)

                NavigationLink(destination: FollowListView(userId: user.id, type: .followers)) {
                    HStack(spacing: 4) {
                        Text("\(user.followerCount)")
                            .fontWeight(.semibold)
                        Text("Followers")
                            .foregroundColor(.secondary)
                    }
                    .font(.subheadline)
                }
                .buttonStyle(.plain)
            }
        }
        .padding()
    }
}

// MARK: - View Model

enum ProfileTab {
    case posts
    case replies
    case likes
}

@MainActor
class ProfileViewModel: ObservableObject {
    @Published var user: User
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var hasMore = true
    @Published var isFollowing: Bool
    @Published var selectedTab: ProfileTab = .posts

    private var cursor: String?

    init(user: User) {
        self.user = user
        self.isFollowing = user.isFollowing ?? false
    }

    func loadPosts() async {
        isLoading = true
        cursor = nil

        let includeReplies = selectedTab == .replies

        do {
            let response = try await APIClient.shared.request(
                PostListResponse.self,
                path: "/users/\(user.id)/posts",
                queryItems: [
                    URLQueryItem(name: "includeReplies", value: String(includeReplies))
                ]
            )
            posts = response.data.items
            cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Handle error
        }

        isLoading = false
    }

    func loadMorePosts() async {
        guard hasMore, let cursor = cursor else { return }

        do {
            let response = try await APIClient.shared.request(
                PostListResponse.self,
                path: "/users/\(user.id)/posts",
                queryItems: [URLQueryItem(name: "cursor", value: cursor)]
            )
            posts.append(contentsOf: response.data.items)
            self.cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Handle error
        }
    }

    func toggleFollow() async {
        isFollowing.toggle()

        do {
            if isFollowing {
                try await APIClient.shared.requestVoid(path: "/users/\(user.id)/follow", method: .post)
            } else {
                try await APIClient.shared.requestVoid(path: "/users/\(user.id)/follow", method: .delete)
            }
        } catch {
            isFollowing.toggle()
        }
    }
}

// MARK: - Follow List View

struct FollowListView: View {
    let userId: String
    let type: FollowListType

    @StateObject private var viewModel: FollowListViewModel

    init(userId: String, type: FollowListType) {
        self.userId = userId
        self.type = type
        _viewModel = StateObject(wrappedValue: FollowListViewModel(userId: userId, type: type))
    }

    var body: some View {
        List {
            ForEach(viewModel.users) { user in
                NavigationLink(destination: ProfileView(user: user)) {
                    UserRowView(user: user)
                }
            }

            if viewModel.hasMore {
                ProgressView()
                    .onAppear {
                        Task { await viewModel.loadMore() }
                    }
            }
        }
        .listStyle(.plain)
        .navigationTitle(type.title)
        .task {
            await viewModel.load()
        }
    }
}

enum FollowListType {
    case followers
    case following

    var title: String {
        switch self {
        case .followers: return "Followers"
        case .following: return "Following"
        }
    }
}

@MainActor
class FollowListViewModel: ObservableObject {
    @Published var users: [User] = []
    @Published var hasMore = true

    private let userId: String
    private let type: FollowListType
    private var cursor: String?

    init(userId: String, type: FollowListType) {
        self.userId = userId
        self.type = type
    }

    func load() async {
        let endpoint = type == .followers ? "/users/\(userId)/followers" : "/users/\(userId)/following"

        do {
            let response = try await APIClient.shared.request(UserListResponse.self, path: endpoint)
            users = response.data.items
            cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Handle error
        }
    }

    func loadMore() async {
        guard hasMore, let cursor = cursor else { return }

        let endpoint = type == .followers ? "/users/\(userId)/followers" : "/users/\(userId)/following"

        do {
            let response = try await APIClient.shared.request(
                UserListResponse.self,
                path: endpoint,
                queryItems: [URLQueryItem(name: "cursor", value: cursor)]
            )
            users.append(contentsOf: response.data.items)
            self.cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Handle error
        }
    }
}

// MARK: - User Row View

struct UserRowView: View {
    let user: User

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: URL(string: user.avatarUrl ?? "")) { image in
                image.resizable()
            } placeholder: {
                Circle()
                    .fill(Color(.systemGray4))
                    .overlay {
                        Text(user.resolvedDisplayName.prefix(1).uppercased())
                            .foregroundColor(.secondary)
                    }
            }
            .frame(width: 44, height: 44)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(user.resolvedDisplayName)
                        .font(.subheadline.weight(.semibold))

                    if user.isVerified {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundColor(.accentColor)
                            .font(.caption)
                    }
                }

                Text(user.displayUsername)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
    }
}
