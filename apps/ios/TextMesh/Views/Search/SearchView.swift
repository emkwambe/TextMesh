// =================================
// SEARCH VIEW
// =================================

import SwiftUI

struct SearchView: View {
    @StateObject private var viewModel = SearchViewModel()
    @State private var searchText = ""
    @State private var selectedType: SearchType = .all

    var body: some View {
        VStack(spacing: 0) {
            if !searchText.isEmpty {
                Picker("Type", selection: $selectedType) {
                    ForEach(SearchType.allCases, id: \.self) { type in
                        Text(type.title).tag(type)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.bottom, 8)
            }

            if searchText.isEmpty {
                // Trending
                TrendingView()
            } else if viewModel.isLoading {
                Spacer()
                ProgressView()
                Spacer()
            } else {
                List {
                    if selectedType == .all || selectedType == .users {
                        if !viewModel.users.isEmpty {
                            Section("Users") {
                                ForEach(viewModel.users) { user in
                                    NavigationLink(destination: ProfileView(user: user)) {
                                        UserRowView(user: user)
                                    }
                                }
                            }
                        }
                    }

                    if selectedType == .all || selectedType == .posts {
                        if !viewModel.posts.isEmpty {
                            Section("Posts") {
                                ForEach(viewModel.posts) { post in
                                    NavigationLink(destination: PostDetailView(post: post)) {
                                        PostRowView(post: post)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    if selectedType == .all || selectedType == .groups {
                        if !viewModel.groups.isEmpty {
                            Section("Groups") {
                                ForEach(viewModel.groups) { group in
                                    NavigationLink(destination: GroupDetailView(group: group)) {
                                        GroupRowView(group: group)
                                    }
                                }
                            }
                        }
                    }

                    if selectedType == .all || selectedType == .hashtags {
                        if !viewModel.hashtags.isEmpty {
                            Section("Hashtags") {
                                ForEach(viewModel.hashtags, id: \.self) { tag in
                                    NavigationLink(destination: HashtagFeedView(tag: tag)) {
                                        Label("#\(tag)", systemImage: "number")
                                    }
                                }
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Search")
        .searchable(text: $searchText, prompt: "Search users, posts, groups...")
        .onChange(of: searchText) { _, newValue in
            Task { await viewModel.search(query: newValue, type: selectedType) }
        }
        .onChange(of: selectedType) { _, newValue in
            Task { await viewModel.search(query: searchText, type: newValue) }
        }
    }
}

// MARK: - Search Type

enum SearchType: CaseIterable {
    case all
    case users
    case posts
    case groups
    case hashtags

    var title: String {
        switch self {
        case .all: return "All"
        case .users: return "Users"
        case .posts: return "Posts"
        case .groups: return "Groups"
        case .hashtags: return "Tags"
        }
    }
}

// MARK: - View Model

@MainActor
class SearchViewModel: ObservableObject {
    @Published var users: [User] = []
    @Published var posts: [Post] = []
    @Published var groups: [Group] = []
    @Published var hashtags: [String] = []
    @Published var isLoading = false

    private var searchTask: Task<Void, Never>?

    func search(query: String, type: SearchType) async {
        searchTask?.cancel()

        guard query.count >= 2 else {
            users = []
            posts = []
            groups = []
            hashtags = []
            return
        }

        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000) // 300ms debounce

            guard !Task.isCancelled else { return }

            isLoading = true

            do {
                let response = try await APIClient.shared.request(
                    SearchResponse.self,
                    path: "/search",
                    queryItems: [
                        URLQueryItem(name: "q", value: query),
                        URLQueryItem(name: "type", value: type == .all ? "all" : type.title.lowercased())
                    ]
                )

                guard !Task.isCancelled else { return }

                users = response.data.users?.items ?? []
                posts = response.data.posts?.items ?? []
                groups = response.data.groups?.items ?? []
                hashtags = response.data.hashtags ?? []
            } catch {
                // Handle error
            }

            isLoading = false
        }
    }
}

// MARK: - Search Response

struct SearchResponse: Codable {
    let success: Bool
    let data: SearchData
}

struct SearchData: Codable {
    let users: UserListData?
    let posts: PostListData?
    let groups: GroupListData?
    let hashtags: [String]?
}

// MARK: - Trending View

struct TrendingView: View {
    @StateObject private var viewModel = TrendingViewModel()

    var body: some View {
        List {
            Section("Trending Hashtags") {
                if viewModel.isLoading {
                    ProgressView()
                } else {
                    ForEach(viewModel.hashtags, id: \.tag) { hashtag in
                        NavigationLink(destination: HashtagFeedView(tag: hashtag.tag)) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("#\(hashtag.tag)")
                                    .font(.headline)

                                Text("\(hashtag.postCount) posts")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .task {
            await viewModel.load()
        }
    }
}

struct TrendingHashtag: Codable {
    let tag: String
    let postCount: Int
}

@MainActor
class TrendingViewModel: ObservableObject {
    @Published var hashtags: [TrendingHashtag] = []
    @Published var isLoading = false

    func load() async {
        isLoading = true

        do {
            struct Response: Codable {
                let success: Bool
                let data: DataContainer
            }
            struct DataContainer: Codable {
                let hashtags: [TrendingHashtag]
            }

            let response = try await APIClient.shared.request(Response.self, path: "/search/trending/hashtags")
            hashtags = response.data.hashtags
        } catch {
            // Handle error
        }

        isLoading = false
    }
}

// MARK: - Hashtag Feed View

struct HashtagFeedView: View {
    let tag: String
    @StateObject private var viewModel: HashtagFeedViewModel

    init(tag: String) {
        self.tag = tag
        _viewModel = StateObject(wrappedValue: HashtagFeedViewModel(tag: tag))
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
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
                            Task { await viewModel.loadMore() }
                        }
                }
            }
        }
        .navigationTitle("#\(tag)")
        .task {
            await viewModel.load()
        }
    }
}

@MainActor
class HashtagFeedViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var hasMore = true

    private let tag: String
    private var cursor: String?

    init(tag: String) {
        self.tag = tag
    }

    func load() async {
        do {
            let response = try await APIClient.shared.request(
                PostListResponse.self,
                path: "/feed/hashtag/\(tag)"
            )
            posts = response.data.items
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
                PostListResponse.self,
                path: "/feed/hashtag/\(tag)",
                queryItems: [URLQueryItem(name: "cursor", value: cursor)]
            )
            posts.append(contentsOf: response.data.items)
            self.cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Handle error
        }
    }
}

// MARK: - Group Row View

struct GroupRowView: View {
    let group: Group

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: URL(string: group.avatarUrl ?? "")) { image in
                image.resizable()
            } placeholder: {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(.systemGray4))
                    .overlay {
                        Image(systemName: "person.3.fill")
                            .foregroundColor(.secondary)
                    }
            }
            .frame(width: 48, height: 48)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(group.name)
                    .font(.subheadline.weight(.semibold))

                Text("\(group.memberCount) members")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
    }
}
