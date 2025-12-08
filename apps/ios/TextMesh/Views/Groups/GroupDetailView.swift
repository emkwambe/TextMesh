// =================================
// GROUP DETAIL VIEW
// =================================

import SwiftUI

struct GroupDetailView: View {
    let group: Group
    @StateObject private var viewModel: GroupDetailViewModel
    @State private var showingMembers = false
    @State private var showingSettings = false

    init(group: Group) {
        self.group = group
        _viewModel = StateObject(wrappedValue: GroupDetailViewModel(group: group))
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: .sectionHeaders) {
                // Header
                GroupHeaderView(
                    group: viewModel.group,
                    isMember: viewModel.isMember,
                    onJoin: { Task { await viewModel.toggleMembership() } },
                    onMembers: { showingMembers = true }
                )

                Divider()

                // Posts
                Section {
                    if viewModel.posts.isEmpty && !viewModel.isLoading {
                        ContentUnavailableView {
                            Label("No Posts", systemImage: "text.bubble")
                        } description: {
                            Text("Be the first to post in this group")
                        }
                        .padding(.top, 40)
                    } else {
                        ForEach(viewModel.posts) { post in
                            NavigationLink(destination: PostDetailView(post: post)) {
                                PostRowView(post: post)
                            }
                            .buttonStyle(.plain)
                            Divider()
                        }

                        if viewModel.hasMore {
                            ProgressView()
                                .padding()
                                .onAppear {
                                    Task { await viewModel.loadMorePosts() }
                                }
                        }
                    }
                } header: {
                    HStack {
                        Text("Posts")
                            .font(.headline)
                        Spacer()
                    }
                    .padding()
                    .background(Color(.systemBackground))
                }
            }
        }
        .navigationTitle(group.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if viewModel.group.memberRole == .owner || viewModel.group.memberRole == .admin {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { showingSettings = true }) {
                        Image(systemName: "gearshape")
                    }
                }
            }
        }
        .sheet(isPresented: $showingMembers) {
            GroupMembersView(groupId: group.id)
        }
        .task {
            await viewModel.loadPosts()
        }
    }
}

// MARK: - Group Header

struct GroupHeaderView: View {
    let group: Group
    let isMember: Bool
    let onJoin: () -> Void
    let onMembers: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Avatar and join button
            HStack(alignment: .top) {
                AsyncImage(url: URL(string: group.avatarUrl ?? "")) { image in
                    image.resizable()
                } placeholder: {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(.systemGray4))
                        .overlay {
                            Image(systemName: "person.3.fill")
                                .font(.title)
                                .foregroundColor(.secondary)
                        }
                }
                .frame(width: 80, height: 80)
                .clipShape(RoundedRectangle(cornerRadius: 16))

                Spacer()

                Button(isMember ? "Joined" : "Join", action: onJoin)
                    .buttonStyle(isMember ? .bordered : .borderedProminent)
            }

            // Name and privacy
            VStack(alignment: .leading, spacing: 4) {
                Text(group.name)
                    .font(.title2.bold())

                HStack(spacing: 4) {
                    Image(systemName: group.privacy == .public ? "globe" : "lock")
                    Text(group.privacy.displayName)
                }
                .font(.subheadline)
                .foregroundColor(.secondary)
            }

            // Description
            if let description = group.description {
                Text(description)
                    .font(.body)
            }

            // Stats
            Button(action: onMembers) {
                HStack(spacing: 16) {
                    HStack(spacing: 4) {
                        Text("\(group.memberCount)")
                            .fontWeight(.semibold)
                        Text("Members")
                            .foregroundColor(.secondary)
                    }

                    HStack(spacing: 4) {
                        Text("\(group.postCount)")
                            .fontWeight(.semibold)
                        Text("Posts")
                            .foregroundColor(.secondary)
                    }
                }
                .font(.subheadline)
            }
            .buttonStyle(.plain)
        }
        .padding()
    }
}

// MARK: - Group Members View

struct GroupMembersView: View {
    let groupId: String
    @StateObject private var viewModel: GroupMembersViewModel
    @Environment(\.dismiss) var dismiss

    init(groupId: String) {
        self.groupId = groupId
        _viewModel = StateObject(wrappedValue: GroupMembersViewModel(groupId: groupId))
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(viewModel.members) { member in
                    NavigationLink(destination: ProfileView(user: member.user)) {
                        HStack {
                            UserRowView(user: member.user)

                            if member.role != .member {
                                Text(member.role.rawValue.capitalized)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color(.systemGray5))
                                    .cornerRadius(4)
                            }
                        }
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
            .navigationTitle("Members")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                await viewModel.load()
            }
        }
    }
}

@MainActor
class GroupMembersViewModel: ObservableObject {
    @Published var members: [GroupMember] = []
    @Published var hasMore = true

    private let groupId: String
    private var cursor: String?

    init(groupId: String) {
        self.groupId = groupId
    }

    func load() async {
        do {
            let response = try await APIClient.shared.request(
                GroupMemberListResponse.self,
                path: "/groups/\(groupId)/members"
            )
            members = response.data.items
            cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Handle error
        }
    }

    func loadMore() async {
        guard hasMore, let cursor = cursor else { return }

        do {
            let response = try await APIClient.shared.request(
                GroupMemberListResponse.self,
                path: "/groups/\(groupId)/members",
                queryItems: [URLQueryItem(name: "cursor", value: cursor)]
            )
            members.append(contentsOf: response.data.items)
            self.cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Handle error
        }
    }
}

// MARK: - View Model

@MainActor
class GroupDetailViewModel: ObservableObject {
    @Published var group: Group
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var hasMore = true
    @Published var isMember: Bool

    private var cursor: String?

    init(group: Group) {
        self.group = group
        self.isMember = group.isMember
    }

    func loadPosts() async {
        isLoading = true

        do {
            let response = try await APIClient.shared.request(
                PostListResponse.self,
                path: "/groups/\(group.id)/feed"
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
                path: "/groups/\(group.id)/feed",
                queryItems: [URLQueryItem(name: "cursor", value: cursor)]
            )
            posts.append(contentsOf: response.data.items)
            self.cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Handle error
        }
    }

    func toggleMembership() async {
        isMember.toggle()

        do {
            if isMember {
                try await APIClient.shared.requestVoid(
                    path: "/groups/\(group.id)/join",
                    method: .post
                )
            } else {
                try await APIClient.shared.requestVoid(
                    path: "/groups/\(group.id)/leave",
                    method: .post
                )
            }
        } catch {
            isMember.toggle()
        }
    }
}
